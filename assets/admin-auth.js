(() => {
  'use strict';
  const credentials = Object.freeze({username: 'isozaki', password: '3732'});
  Object.defineProperty(globalThis, 'DES_ADMIN_CREDENTIALS', {
    value: credentials,
    writable: false,
    configurable: false
  });
})();
