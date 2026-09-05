#!/bin/bash
#
# Builds the two app bundles that start and stop Local Web Enjoy.
#
# An app bundle is a directory with a plist and an executable in it, so there is
# nothing to compile and nothing to install: this writes both by hand. Run it
# again after moving the repository, since each bundle records where the
# repository was when it was built.
#
#   ~/Applications/Enjoy.app        start if needed, then open the browser
#   ~/Applications/退出 Enjoy.app    stop both servers
#
# Pass a directory to put them somewhere else.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCHER="$REPO/scripts/enjoy-local-web.sh"
DEST="${1:-$HOME/Applications}"
ICON="$REPO/enjoy/assets/icon.icns"

build() {
  local name="$1" identifier="$2" command="$3"
  local app="$DEST/$name.app"

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

  # The stub checks that it can read the repository before handing over. On an
  # external volume it often cannot: macOS gates removable volumes per app, and
  # an unsigned bundle is refused without ever being offered the prompt that
  # would fix it. Unchecked, that arrives as an app that does nothing at all
  # when double-clicked, which is the least debuggable failure there is.
  cat > "$app/Contents/MacOS/launch" <<LAUNCH
#!/bin/bash
LAUNCHER="$LAUNCHER"

# Reading a byte, rather than testing -r: on a volume macOS is withholding, the
# metadata still answers and only the content does not, so -r passes and the
# refusal arrives later as a bare "Operation not permitted" nobody sees.
if ! head -c 1 "\$LAUNCHER" >/dev/null 2>&1; then
  osascript >/dev/null 2>&1 <<'ALERT'
display alert "Enjoy 无法读取仓库" message "仓库在外置磁盘上，而 macOS 默认不允许应用读取外置卷。

打开「系统设置 → 隐私与安全性 → 完全磁盘访问权限」，用 + 把 Enjoy.app 和 退出 Enjoy.app 加进去并打开开关，然后再试一次。

（把仓库移到内置磁盘也可以，之后重新运行 scripts/make-mac-app.sh。）" buttons {"打开系统设置", "好"} default button "打开系统设置"
if button returned of result is "打开系统设置" then
  open location "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
end if
ALERT
  exit 1
fi

exec "\$LAUNCHER" $command
LAUNCH
  chmod +x "$app/Contents/MacOS/launch"

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
