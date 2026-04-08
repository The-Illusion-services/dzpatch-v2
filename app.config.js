// app.config.js — dynamic config so process.env is resolved at build time
// EAS reads this file; app.json is kept as fallback for tooling that needs static JSON.
const IS_DEV = process.env.APP_VARIANT === 'development' || !process.env.EAS_BUILD;
const GOOGLE_MAPS_API_KEY =
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ||
  '';

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    name: 'dzpatch-v2',
    slug: 'dzpatch-v2',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'dzpatchv2',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    android: {
      package: 'com.dzpatch.v2',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      config: {
        googleMaps: {
          apiKey: GOOGLE_MAPS_API_KEY,
        },
      },
      edgeToEdgeEnabled: false,
      predictiveBackGestureEnabled: false,
      permissions: [
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_BACKGROUND_LOCATION',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_LOCATION',
      ],
    },
    ios: {
      supportsTablet: true,
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Allow Dzpatch to use your location to find nearby deliveries and track your route.',
          locationAlwaysAndWhenInUsePermission:
            'Allow Dzpatch to track your location in the background so customers can follow their delivery in real time.',
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true,
        },
      ],
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: {
            backgroundColor: '#000000',
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: 'e61984a4-ca60-4c6f-be21-19b1ebf21360',
      },
    },
  },
};
