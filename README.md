# Enjoy — 本地网页版

用于精听和跟读的外语学习工具。导入音频或视频，切成句子，逐句跟读，给你的发音打分。

这个分支只保留**本地网页版**（Local Web Enjoy）：在自己机器上起一个本地服务，用浏览器打开。
**不需要账号**，不连 enjoy.bot，音频、转写、录音和评分全部留在本机。

仓库里仍有 Electron 桌面版的代码——网页版跑的就是它的主进程代码，只是换了个宿主——但本分支不使用桌面版。

---

## 快速开始

需要 **Node ≥ 20**。

Yarn 的版本由仓库自带（`.yarn/releases/yarn-4.6.0.cjs`），但你的机器上得先有 `yarn`
这个命令。没有的话用 Node 自带的 corepack 装一个：

```bash
corepack enable
```

然后：

```bash
yarn install
yarn enjoy:web
```

启动成功时终端最后会打印：

```
Local Web Enjoy UI listening on http://127.0.0.1:7101/
```

浏览器打开 **http://127.0.0.1:7101**。

用 `127.0.0.1` 或 `localhost` 访问，不要用本机的局域网 IP——浏览器只在这两个地址下
把页面当作安全上下文，否则录音拿不到麦克风权限。两个服务（前端 7101、本地服务 7100）
本来也只监听回环地址，同一网络里的其他机器访问不到。

停止：在终端按 `Ctrl-C`。

### macOS：做一个双击启动的 App

每次开终端敲命令、并且让那个窗口一直开着，用起来是别扭的。仓库里有个生成器，
把启动包成两个普通的 mac 应用：

```bash
./scripts/make-mac-app.sh              # 生成到 ~/Applications
./scripts/make-mac-app.sh /Applications  # 或者别处
```

得到 `Enjoy.app` 和 `退出 Enjoy.app`。双击前者：没在跑就后台起服务、等到前端真的
能应答了再打开浏览器；已经在跑就直接开浏览器，不会起第二份。双击后者停掉两个服务。
两个都能拖进 Dock，也能用 Spotlight 搜到。日志在 `~/Library/Logs/enjoy-local-web.log`。

生成的 App 只是个壳，逻辑在 `scripts/enjoy-local-web.sh` 里，也可以直接用：

```bash
./scripts/enjoy-local-web.sh start|open|stop|status
```

它会自己找 node（Finder 启动的应用读不到你 shell 里的 PATH），依次试 PATH、nvm、
fnm、volta、Homebrew；都不对就用 `ENJOY_NODE_BIN` 指定。仓库换了位置，重跑一次
`make-mac-app.sh` 即可。

> **仓库放在外置磁盘上的话**，先给这两个 App 授权：**系统设置 → 隐私与安全性 →
> 完全磁盘访问权限**，用 `+` 把它们加进去。macOS 默认不让应用读外置卷，而且是静默
> 拒绝——没授权时双击会弹窗提示你这件事。把仓库放在内置磁盘则不需要这一步。
>
> 重新跑过 `make-mac-app.sh` 之后，列表里的旧条目要先用 `−` 删掉再重新添加：
> 新生成的 App 是新的身份，旧授权不会自动接上。

---

## 配置密钥

转写、发音评估和语音合成分别依赖不同的服务商，各自的密钥可以只配需要的那些。

```bash
cp enjoy/.env.example enjoy/.env
```

| 变量 | 用途 |
| --- | --- |
| `OPENAI_API_KEY` | 转写。`OPENAI_BASE_URL` 可指向兼容端点 |
| `AZURE_SPEECH_KEY`、`AZURE_SPEECH_REGION` | 发音评估，只有 Azure 提供音素级评分。region 是你创建 Speech 资源时选的区域，例如 `eastus` |
| `ELEVENLABS_API_KEY` | 语音合成。不填则 Preferences 里的音色列表为空 |

`.env` 在启动时读一次，写进和偏好设置同一份存储，所以你也可以不用 `.env`，
直接在 **Preferences → 高级设置** 里填。两种方式可以混用：环境变量里设了的覆盖已存的，
没设的不动。

**查词功能目前在网页版不可用**——内置的 Cambridge 词典和自定义 mdict 词典，它们的
handler 只在 Electron 宿主里注册（`camdict-lookup`、`mdict-lookup`、`dict-list`
在这里都会答"没有注册 handler"）。跟读和评分不受影响。

---

## 怎么用

1. **导入** 音频或视频文件（也支持 YouTube 链接）
2. **转写** 得到逐句的文本和时间轴
3. **跟读**：选中一句循环播放，按录音键跟着说
4. **打分**：看两个数字——发音分和跟读相似度

### 两个分数分别在说什么

| | 发音评估（Assessment） | 跟读相似度（Likeness） |
| --- | --- | --- |
| 比的对象 | 句子的**文本**，对照母语者模型 | 这一条**原声音频**本身 |
| 回答的问题 | 念得准不准 | 像不像你正在跟的这个人 |
| 分项 | 准确度、流利度、完整度、韵律 | 语调、节奏、语速 |
| 需要密钥 | 需要 Azure | 不需要，本地算 |

两个分数**不是重复的**。你可以用一种完全自然、但和原声不同的语调把句子念完——
发音评估给高分，跟读相似度给低分。反过来也成立。跟读练的是后者，所以两个都要看。

跟读相似度在**开启「对比」**后显示在录音波形的左上角，悬停可以看三项拆分。
它把两条音高曲线各自换算成相对自身中位音高的半音，所以低音嗓子跟读高音说话人不会被扣分。

### 进步曲线

同一句有两条以上已评估的录音时，左侧录音列表顶部会画出这句话历次尝试的分数折线，
两端标出首末分数。跟读的收益是"同一句练 N 遍有没有进步"，这条线就是拿来看这个的。

### 两个值得打开的开关

**Preferences → 高级设置**：

- **自动评估录音** — 每录完一条自动打分，不用手动点。默认关闭，因为每次评估都是一次
  付费的 Azure 调用，而一次练习会录很多废弃的 take。
- **评估韵律** — 额外评估重音、语调、语速和节奏，并标出念得平板的句子和停顿不当的位置。
  这是 Azure 的付费附加功能，在每次评估的费用之上另行计费，且**仅支持 en-US**。

### 费用参考

Azure 按音频时长计费（约 $1–1.32/小时），一条 5 秒录音约 $0.002。
免费层每月 5 小时音频，够约 3600 条 5 秒录音——个人使用通常用不完。
开启韵律会让每次评估的费用大致翻倍。

---

## 配置项

| 变量 | 含义 |
| --- | --- |
| `SETTINGS_PATH` | `settings.json` 所在目录。默认 `~/.config/enjoy-local-web` |
| `LIBRARY_PATH` | 资料库位置。默认 `~/Documents/EnjoyLibrary` |
| `ENJOY_WEB_UI_PORT` | 前端端口，默认 7101，设 `0` 自动选空闲端口 |
| `ENJOY_WEB_PORT` | 本地服务端口，默认 7100 |
| `ENJOY_YT_DLP_PATH` | 拉取 YouTube 链接用的 yt-dlp |

---

## 开发

```bash
yarn enjoy:typecheck
yarn enjoy:lint
yarn enjoy:test:node    # 不需要构建，跑本地服务的 HTTP 接口和纯函数测试
```

延伸阅读：

- [`enjoy/src/web/README.md`](enjoy/src/web/README.md) — 网页版是怎么实现的：本地服务、
  浏览器桥接、Electron 替身、以及各条路径的取舍
- [`enjoy/CONTEXT.md`](enjoy/CONTEXT.md) — 领域术语表
- [`enjoy/docs/adr/`](enjoy/docs/adr/) — 架构决策记录

---

## 关于上游

本项目基于 [ZuodaoTech/everyone-can-use-english](https://github.com/ZuodaoTech/everyone-can-use-english)。
上游提供托管版（enjoy.bot）、浏览器插件和桌面版，需要账号；本分支只做不依赖账号的本地网页版。
