
## 关于git提交
提交历史始终使用单行的，简短的带有fix、feat等前缀和模块的风格来书写，一个提交不应该超过30个汉字。不要带有CLAUDE等字样

## 关于python环境
始终使用uv来管理依赖和运行程序

## 关于python日志
优先使用loguru来进行日志打印和管理，日志默认位于logs目录下，按日期进行切割。且除了记录文件日志，还要同时在终端打印日志。

## 关于python数据库
如果本项目需要用数据库，比如用户要求增加数据库，则优先使用peewee + sqlite3进行数据库管理。且对于peewee的模型定义，统一放到models.py文件中进行管理（如果改文件存在且有其它含义，则必须征求用户确认位置）

## 关于当前项目
采用pywebview + react(已配置tailwindcss)进行桌面端开发。充分利用react的界面优势和python的业务处理优势。
前端源码位于./web-src目录，打包输出到./web目录

## 关于TypeScript
前端代码必须添加完整的类型定义，包括interface定义和函数参数类型注解。使用Record<string, T>来定义可索引对象类型

## 关于开发/生产环境
main.py通过DEV=1环境变量区分开发模式（使用vite dev server）和生产模式（使用打包后的web目录）

## 关于打包应用
打包后的.app内部是只读文件系统，不能在内部创建文件。输出目录和日志目录必须使用用户可写位置（如~/Documents/应用名）

## 关于应用图标
使用create_icon.py生成PNG图标，然后用iconutil转换为.icns格式。图标文件位于icons/目录

## 绝对不可逾越的规则
- python代码，任何时候都不适用emoji符号！！！
- 对于使用pywebview方案的项目，严谨在js_api=Api()的那个API类里存放window对象，因为这将导致win操作系统假死