# Enjoy

本工作区是 Enjoy 应用本身：一份渲染进程代码，两个宿主。

- **本地网页版**是本分支使用的形态——主进程代码跑在普通 Node 进程里，界面交给浏览器，
  没有 Electron 也没有账号。怎么跑见[仓库根目录的 README](../README.md)，
  实现细节见 [`src/web/README.md`](src/web/README.md)。
- **Electron 桌面版**的代码仍在这里（`yarn start`），但本分支不使用，也不保证可用。
