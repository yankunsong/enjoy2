# Local Web Enjoy 通过伪造 Electron 模块复用主进程代码

Local Web Enjoy 需要在没有 Electron 的普通 Node 进程里运行 Desktop Enjoy 的全部主进程能力（数据库、转码、Alignment、下载、词典）。主进程的每个模块都只在一处引入 Electron，且绝大多数只用到 `ipcMain`（个别用到 `app` 取路径）。因此我们提供一个伪 Electron 模块并由构建时的模块解析指向它：伪 `ipcMain.handle` 把处理器登记进一张路由表供 HTTP 层查找，伪 `app.getPath` 返回本机路径。

这样做的结果是主进程的处理器业务代码一行不改就能在两种宿主下运行。代价是模块解析中存在一处"看起来很像谎言"的映射——有人打开这个目录看到一个自制的 `electron` 模块，第一反应会是"这是什么鬼"，故记录于此。

## Considered Options

- **把处理器逐个改写成框架无关的函数**，再分别从 Electron 和 HTTP 两侧调用。语义上更诚实，但要触碰全部 84 个相关处理器，产生大量与本特性无关的 diff，并使后续从上游取用代码变得困难。
- **只移植用得上的少数处理器**。看似省事，但处理器之间互相调用（导入 Media 会触发转码、元数据、封面、波形），移植边界很难划干净。

## Consequences

主进程代码从此隐含一条约束：**新代码只能使用 `ipcMain`、`app.getPath` 和 `app.isPackaged` 这几个已被伪造的 Electron 接口**（`app.isPackaged` 决定数据库文件名，既有代码已经依赖它）。用到其他 Electron API 的主进程代码会在 Local Web Enjoy 下运行时才失败，而不是构建时。
