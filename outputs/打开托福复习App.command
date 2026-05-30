#!/bin/zsh
cd "$(dirname "$0")/toefl-app" || exit 1

PORT=8765
IP=$(ipconfig getifaddr en0 2>/dev/null)
if [ -z "$IP" ]; then
  IP=$(ipconfig getifaddr en1 2>/dev/null)
fi

clear
echo "TOEFL 复习 App 已准备启动"
echo ""
echo "电脑访问："
echo "  http://localhost:${PORT}"
echo ""
if [ -n "$IP" ]; then
  echo "iPhone / iPad 访问："
  echo "  http://${IP}:${PORT}"
  echo ""
  echo "打开后，在 Safari 点分享按钮，再点“添加到主屏幕”。"
else
  echo "没有找到 Wi-Fi 地址。请确认 Mac 和 iPhone/iPad 在同一个 Wi-Fi。"
fi
echo ""
echo "保持这个窗口打开；复习完可以直接关闭窗口。"
echo ""
python3 -m http.server "$PORT" --bind 0.0.0.0
