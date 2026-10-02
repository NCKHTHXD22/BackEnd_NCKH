const { withProjectBuildGradle } = require("@expo/config-plugins");

// Một số dependency transitive (qua io.github.react-native-async-storage:
// shared-storage-android) kéo kotlin-stdlib 2.2.10 vào, cao hơn bản 2.0.21 mà
// project này (và .aar tiền biên dịch như shared-storage.aar) thực sự dùng →
// lỗi "Module was compiled with an incompatible version of Kotlin" ở task
// kspReleaseKotlin khi build release APK.
//
// android/build.gradle bị `expo prebuild` ghi đè mỗi lần chạy nên không thể
// sửa tay trực tiếp — plugin này tự chèn lại đoạn ép phiên bản mỗi lần
// prebuild để APK release luôn build được.
const RESOLUTION_STRATEGY_BLOCK = `
  // [withKotlinStdlibFix] Ép kotlin-stdlib về đúng 2.0.21 — xem plugins/withKotlinStdlibFix.js
  configurations.all {
    resolutionStrategy {
      force "org.jetbrains.kotlin:kotlin-stdlib:2.0.21"
      force "org.jetbrains.kotlin:kotlin-stdlib-jdk7:2.0.21"
      force "org.jetbrains.kotlin:kotlin-stdlib-jdk8:2.0.21"
      force "org.jetbrains.kotlin:kotlin-stdlib-common:2.0.21"
    }
  }
`;

module.exports = function withKotlinStdlibFix(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.contents.includes("[withKotlinStdlibFix]")) {
      return config;
    }
    config.modResults.contents = config.modResults.contents.replace(
      /allprojects\s*\{/,
      (match) => `${match}\n${RESOLUTION_STRATEGY_BLOCK}`
    );
    return config;
  });
};
