# ProGuard rules for the ForagerFlow TWA shell.
#
# The TWA shell is a thin Trusted Web Activity wrapper: all app logic and the
# ONNX Runtime Web model inference run in the PWA bundle (browser/WebView), not
# in this native code. There are therefore no ONNX or ML classes here to keep.
# We only need to preserve the TWA launcher plumbing that R8 might otherwise
# strip or rename.

# Keep the Trusted Web Activity launcher and its helpers (manifest-declared
# activities are kept automatically, but be explicit against aggressive
# optimization renaming the launcher class).
-keep class com.google.androidbrowserhelper.** { *; }

# Preserve Digital Asset Links / asset_statements metadata referenced via
# reflection by the browser helper.
-keepclassmembers class * {
  @androidx.annotation.Keep <methods>;
}