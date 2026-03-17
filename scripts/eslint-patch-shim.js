import Module from 'node:module';

const patchRequests = new Set([
  '@rushstack/eslint-patch/modern-module-resolution',
  '@rushstack/eslint-patch/lib-commonjs/modern-module-resolution',
  '@rushstack/eslint-patch/lib-commonjs/_patch-base',
  '@rushstack/eslint-patch/lib-commonjs/_patch-base.js',
]);

const originalLoad = Module._load.bind(Module);

Module._load = function (request, parent, isMain, options) {
  if (patchRequests.has(request)) {
    return {};
  }
  return originalLoad(request, parent, isMain, options);
};
