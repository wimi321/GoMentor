# KataGo Release Assets Checklist

## P0 策略

- 不把大 binary/model 普通 Git 提交。
- Release 时准备平台对应 binary 和默认 b18 model。
- 安装包必须包含运行所需资源。

## 资源布局

```text
data/katago/
  manifest.json
  bin/
    darwin-arm64/katago
    darwin-x64/katago
    win32-x64/katago.exe
  models/
    <default-b18-model>.bin.gz
```

## 检查命令

开发模式：

```bash
node scripts/check_katago_assets.mjs --mode=dev
```

发布模式：

```bash
node scripts/check_katago_assets.mjs --mode=release
node scripts/p0_release_candidate_check.mjs --mode=release
```

## checksum

Release 前应记录：

- binary SHA256
- model SHA256
- 下载来源
- KataGo 版本
- 模型名称

## 不通过标准

- manifest 指向不存在的文件
- Windows 打包没有 `katago.exe`
- macOS 打包没有可执行权限
- 默认模型缺失
- release mode 下检查仍只有 warning 而不是 ready
