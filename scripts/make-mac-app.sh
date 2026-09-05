#!/bin/bash
#
# Builds the two app bundles that start and stop Local Web Enjoy.
#
#   ~/Applications/Enjoy.app        start if needed, then open the browser
#   ~/Applications/退出 Enjoy.app    stop both servers
#
# Run this again after moving the repository, since each bundle records where
# the repository was when it was built.
#
# Pass a directory to put them somewhere else.
#
# The bundles are written by hand — a plist and an executable are the whole of
# one — but the executable is compiled rather than a script, which matters more
# than it looks. macOS attaches a privacy decision to the binary that runs, and
# a bundle whose executable is a shell script runs as `/bin/bash`: a system
# binary no grant can be attached to. Granting the app access to an external
# volume then appears to work and changes nothing. A compiled stub of its own
# gives the grant something to hold, and everything it spawns inherits it — so
# the shell half lives inside the bundle and is reached through that stub.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCHER="$REPO/scripts/enjoy-local-web.sh"
DEST="${1:-$HOME/Applications}"
ICON="$REPO/enjoy/assets/icon.icns"

command -v clang >/dev/null 2>&1 || {
  echo "需要 clang。装 Xcode 命令行工具：xcode-select --install" >&2
  exit 1
}

build() {
  local name="$1" identifier="$2" command="$3"
  local app="$DEST/$name.app"
  local run="$app/Contents/Resources/run.sh"

  rm -rf "$app"
  mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"

  cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$name</string>
  <key>CFBundleDisplayName</key><string>$name</string>
  <key>CFBundleIdentifier</key><string>$identifier</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <!-- No Dock icon: both of these do one thing and exit, and a bundle that
       bounces in the Dock on the way past reads as an app that failed to open. -->
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST

  # The shell half, kept inside the bundle so that it is readable even when the
  # repository it points at is not.
  cat > "$run" <<RUN
#!/bin/bash
LAUNCHER="$LAUNCHER"

# Reading a byte, rather than testing -r: on a volume macOS is withholding, the
# metadata still answers and only the content does not, so -r passes and the
# refusal arrives later as a bare "Operation not permitted" nobody sees.
if ! head -c 1 "\$LAUNCHER" >/dev/null 2>&1; then
  osascript >/dev/null 2>&1 <<'ALERT'
display alert "Enjoy 无法读取仓库" message "仓库在外置磁盘上，而 macOS 默认不允许应用读取外置卷。

打开「系统设置 → 隐私与安全性 → 完全磁盘访问权限」，用 + 把 Enjoy.app 和 退出 Enjoy.app 加进去并打开开关，然后再试一次。若列表里已有旧的同名条目，先用 − 删掉再重新添加。

（把仓库移到内置磁盘也可以，之后重新运行 scripts/make-mac-app.sh。）" buttons {"打开系统设置", "好"} default button "打开系统设置"
if button returned of result is "打开系统设置" then
  open location "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
end if
ALERT
  exit 1
fi

exec "\$LAUNCHER" $command
RUN
  chmod +x "$run"

  # The compiled stub: it exists to be the thing the privacy grant names.
  local source="$app/Contents/Resources/launch.c"
  cat > "$source" <<SOURCE
#include <unistd.h>

int main(void) {
  execl("/bin/bash", "bash", "$run", (char *)0);
  return 127;
}
SOURCE
  clang -O2 -Wall -o "$app/Contents/MacOS/launch" "$source"
  rm -f "$source"

  [ -f "$ICON" ] && cp "$ICON" "$app/Contents/Resources/AppIcon.icns"

  # An ad-hoc signature, so that the privacy settings have a bundle identity to
  # attach a decision to. Unsigned, the decision hangs off the path alone, and
  # is the kind of grant that quietly stops applying.
  codesign --force --sign - "$app" >/dev/null 2>&1 || true

  # Tells the Finder to read the bundle it has just been handed, rather than
  # showing the generic icon until something else prompts it to look.
  touch "$app"

  echo "$app"
}

mkdir -p "$DEST"
build "Enjoy" "bot.enjoy.localweb.launcher" "open"
build "退出 Enjoy" "bot.enjoy.localweb.quit" "stop"

cat <<'NOTE'

如果仓库在外置磁盘上，去「系统设置 → 隐私与安全性 → 完全磁盘访问权限」把这两个
App 加进去。列表里若已有旧条目，先用 − 删掉再重新添加：重新生成过的 App 是新的身份，
旧授权不会自动接上。
NOTE
