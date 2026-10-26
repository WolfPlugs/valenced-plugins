#!/usr/bin/env bash
set -euo pipefail
native_dir="${RUNNER_TEMP}/nsfw-native"
mkdir -p "$native_dir"
curl --fail --location --retry 3 https://github.com/JetBrains/kotlin/releases/download/v2.4.0/kotlin-compiler-2.4.0.zip -o "$native_dir/kotlin.zip"
unzip -q "$native_dir/kotlin.zip" -d "$native_dir"
curl --fail --location --retry 3 https://github.com/Valenced/valenced/archive/539c417a605a10a3535f1616c02bbd95ae286fb7.tar.gz -o "$native_dir/api.tar.gz"
tar -xzf "$native_dir/api.tar.gz" -C "$native_dir"
curl --fail --location --retry 3 https://api.xposed.info/de/robv/android/xposed/api/82/api-82.jar -o "$native_dir/xposed-api.jar"
curl --fail --location --retry 3 https://repo.maven.apache.org/maven2/org/jetbrains/kotlinx/kotlinx-coroutines-core-jvm/1.10.2/kotlinx-coroutines-core-jvm-1.10.2.jar -o "$native_dir/coroutines.jar"
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" 'platforms;android-36' 'build-tools;36.0.0'
android_jar="$ANDROID_HOME/platforms/android-36/android.jar"
curl --fail --location --retry 3 https://repo.maven.apache.org/maven2/org/luckypray/dexkit/2.3.0/dexkit-2.3.0.aar -o "$native_dir/dexkit.aar"
unzip -p "$native_dir/dexkit.aar" classes.jar > "$native_dir/dexkit.jar"
printf '%s\n' 'package app.valenced.core' 'internal const val API_VERSION_STRING = "1.0.0"' > "$native_dir/BuildConfig.kt"
"$native_dir/kotlinc/bin/kotlinc" \
    "$native_dir/valenced-539c417a605a10a3535f1616c02bbd95ae286fb7/android/api/src/main/kotlin" \
    "$native_dir/valenced-539c417a605a10a3535f1616c02bbd95ae286fb7/core/src/commonMain/kotlin/app/valenced/plugins/PluginManifest.kt" \
    "$native_dir/valenced-539c417a605a10a3535f1616c02bbd95ae286fb7/core/src/commonMain/kotlin/app/valenced/plugins/Version.kt" \
    "$native_dir/BuildConfig.kt" \
    -classpath "$android_jar:$native_dir/xposed-api.jar:$native_dir/coroutines.jar:$native_dir/dexkit.jar" \
    -jvm-target 17 -d "$native_dir/valenced-api.jar"
{
    echo "KOTLIN_HOME=$native_dir/kotlinc"
    echo "ANDROID_JAR=$android_jar"
    echo "VALENCED_API_JAR=$native_dir/valenced-api.jar"
    echo "XPOSED_API_JAR=$native_dir/xposed-api.jar"
    echo "DEXKIT_JAR=$native_dir/dexkit.jar"
    echo "COROUTINES_JAR=$native_dir/coroutines.jar"
    echo "D8=$ANDROID_HOME/build-tools/36.0.0/d8"
} >> "$GITHUB_ENV"
