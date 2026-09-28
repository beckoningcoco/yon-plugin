/**
 * The data contract both halves share: the host serves these shapes over
 * `/yon/api`, and the browser half renders them. Keeping it in one module is
 * what stops the two sides from drifting.
 */
/** Every status, in display order (the client renders these as options). */
export const PROJECT_STATUSES = ['active', 'paused', 'done'];
/** Where the API lives, shared by the host's route table and the client's calls. */
export const API_PREFIX = '/yon/api';
