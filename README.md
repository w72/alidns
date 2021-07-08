# alidns-deno

## 使用方法

### 直接启动

1. deno run -A mod.ts

### 作为 systemd daemon 运行

1. sudo -i
2. clone 项目到 /opt/alidns
3. cp config.example.toml config.toml
4. 修改 config.toml 中的配置
5. cp alidns.service /usr/lib/systemd/system/
6. systemd enable --now alidns

### 查看状态

- systemd status alidns
- journalctl -f -u alidns

### 卸载

1. systemd disable --now alidns
2. rm -rf /usr/lib/systemd/system/alidns.service
3. rm -rf /opt/alidns
