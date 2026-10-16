import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.ObjectInputStream;
import java.io.OutputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;

/**
 * Runs one captured call again, offline, against the real code.
 *
 * <p>This is the offline half of a replay: {@code arthas_capture} wrote a live
 * object to disk, and this reads it back and hands it to the same method that
 * produced it. The point is the feedback loop — changing a business method and
 * re-running it against a captured argument takes about four seconds, where doing
 * the same inside the container means restarting NCC and re-driving the screen.
 *
 * <h2>What it is given</h2>
 *
 * <pre>
 *   java -cp "&lt;dir holding this class&gt;;&lt;classpath jar&gt;" Replay &lt;dump&gt; &lt;class&gt; &lt;method&gt; &lt;out&gt;
 * </pre>
 *
 * The classpath jar is a jar whose <em>manifest</em> carries the classpath, because
 * the real one does not fit on a command line: a live NCC 1909 was measured at 5,481
 * entries (a 530 KB manifest, 59 KB once zipped), against a Windows limit of about
 * 32 KB. JDK 8 has no {@code @argfile} either — that arrived in JDK 9.
 *
 * <h2>The two shapes a dump can have</h2>
 *
 * A captured value is either one object or the argument array of the call. An
 * {@code Object[]} is passed as the parameter list; anything else is passed as a
 * single argument. That is why {@code arthas_capture -e params} and
 * {@code -e params[0]} both work and mean different things.
 *
 * <h2>Why the output is a file and not stdout</h2>
 *
 * The business code writes to stdout too — logging, banners, whatever it feels
 * like — so a result read from stdout would have to be told apart from all of that.
 * A file is unambiguous, and it is also what makes two runs comparable: {@code diff}
 * needs two artifacts, not two transcripts.
 *
 * <h2>Why it never exits zero on failure</h2>
 *
 * A replay that silently produced an empty file would be indistinguishable from one
 * whose method returned null. The exit code is the signal; the message on stderr
 * says which exception came out of the real code, which is frequently the whole
 * answer somebody wanted.
 */
public final class Replay {

    private Replay() {
    }

    /**
     * Entry point.
     *
     * @param args {@code <dump> <class> <method> <out>}.
     */
    public static void main(String[] args) {
        if (args.length < 4) {
            System.err.println("usage: Replay <dump> <class> <method> <out>");
            System.exit(2);
            return;
        }
        String dumpPath = args[0];
        String className = args[1];
        String methodName = args[2];
        String outPath = args[3];
        try {
            Object captured = read(dumpPath);
            Object[] params = captured instanceof Object[]
                    ? (Object[]) captured
                    : new Object[] { captured };

            Class<?> owner = Class.forName(className);
            long started = System.currentTimeMillis();
            Object result;
            if ("<init>".equals(methodName)) {
                result = callConstructor(owner, params);
            } else {
                Object instance = owner.newInstance();
                Method method = find(owner, methodName, params.length);
                method.setAccessible(true);
                result = method.invoke(instance, params);
            }
            long cost = System.currentTimeMillis() - started;

            write(outPath, className, methodName, params.length, cost, result);
            System.out.println("REPLAY_OK cost=" + cost + "ms out=" + outPath);
        } catch (Throwable thrown) {
            System.err.println("REPLAY_FAIL " + thrown.getClass().getName() + ": " + thrown.getMessage());
            Throwable cause = thrown.getCause();
            if (cause != null) {
                System.err.println("  caused by " + cause.getClass().getName() + ": " + cause.getMessage());
            }
            System.exit(1);
        }
    }

    /** Read one captured object. */
    private static Object read(String path) throws Exception {
        ObjectInputStream in = new ObjectInputStream(new FileInputStream(path));
        try {
            return in.readObject();
        } finally {
            in.close();
        }
    }

    /**
     * Run a captured constructor.
     *
     * <p>A constructor that failed is recorded as {@code <init>} — that is what the JVM calls it
     * and what a stack trace prints. {@link #find} cannot reach it, because
     * {@code getDeclaredMethods()} does not return constructors at all; without this branch such a
     * capture replayed as {@code NoSuchMethodException}, which reads like a broken capture rather
     * than a missing branch here. Constructors are where parsing and validation failures live
     * (measured: {@code new nc.vo.pub.lang.UFDouble("abc2")} → NumberFormatException), so this is
     * not a corner case.
     *
     * <p>No receiver is needed — the constructor supplies the instance.
     */
    private static Object callConstructor(Class<?> owner, Object[] params) throws Exception {
        for (Constructor<?> candidate : owner.getDeclaredConstructors()) {
            if (candidate.getParameterCount() == params.length) {
                candidate.setAccessible(true);
                return candidate.newInstance(params);
            }
        }
        throw new NoSuchMethodException("<init> with " + params.length + " parameter(s)");
    }

    /**
     * The method with this name and this many parameters.
     *
     * <p>Matched by arity rather than by parameter types because the dump holds
     * values, not a signature — the declared types are exactly what this is trying
     * to avoid having to know. An overloaded pair with the same arity would be
     * ambiguous; the first one declared wins, and the header of the output names it
     * so a wrong pick is visible rather than silent.
     */
    private static Method find(Class<?> owner, String name, int arity) throws NoSuchMethodException {
        for (Method candidate : owner.getDeclaredMethods()) {
            if (candidate.getName().equals(name) && candidate.getParameterCount() == arity) {
                return candidate;
            }
        }
        throw new NoSuchMethodException(name + " with " + arity + " parameter(s)");
    }

    /** Write the outcome, with a header that makes two runs comparable. */
    private static void write(String path, String className, String methodName, int arity,
            long cost, Object result) throws Exception {
        String body = "# " + className + '#' + methodName + '/' + arity + '\n'
                + "# cost=" + cost + "ms\n"
                + (result == null ? "null" : String.valueOf(result)) + '\n';
        OutputStream out = new FileOutputStream(path);
        try {
            out.write(body.getBytes("UTF-8"));
        } finally {
            out.close();
        }
    }
}
