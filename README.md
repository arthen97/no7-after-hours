# No. 7 — After Hours

A late-night private karaoke room game with interactive Three.js characters, 3D room assets, and host selection. Mira's cover uses the actual in-game 3D character render.

## 同事快速开始

1. 从仓库 Releases 下载最新的 `No7-After-Hours` ZIP 并解压。
2. 需要安装 Python 3.9 或更新版本；不需要安装 Node.js 或运行 `npm install`。
3. Mac 双击 `Start-No7.command`；Windows 双击 `Start-No7.bat`。启动器会在本机运行游戏并打开浏览器。
4. 关闭启动器窗口即可停止游戏。

游戏运行在启动它的那台电脑上，地址是 <http://127.0.0.1:4328/>。每位同事都需要下载并在自己的电脑上启动。画面和手动互动可直接使用；实时聊天与语音需要配置 Merouter API key。不要把 key 放进共享压缩包或提交到 GitHub。

## 手动启动

需要 Python 3.9 或更新版本：

```sh
python3 salon_server.py
```

打开 <http://127.0.0.1:4328/>。要启用实时聊天和语音，可在启动前设置 `MEROUTER_SERVICE_KEY`（或 `MEROUTER_API_KEY`）。本地 Laya 推理是可选项；没有该运行时，仍可手动互动。
