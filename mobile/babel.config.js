module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo (SDK 54) inyecta automáticamente react-native-worklets/plugin
    // (el plugin de Reanimated 4) cuando react-native-worklets está instalado,
    // así que NO debe agregarse manualmente o se aplicaría dos veces.
    presets: ['babel-preset-expo'],
  };
};
