import * as core from '@web12/core';

// Web process only produces jobs; the worker consumes them.
core.usePgBossEnqueuer();

export { core };
