// Expo SDK 51 — Babel config. Monorepo'da paketler TS kaynak olarak transpile edilir.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
