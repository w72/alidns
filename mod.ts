import { hmac } from "https://deno.land/x/hmac@v2.0.1/mod.ts";
import { encode } from "https://deno.land/std@0.100.0/encoding/base64.ts";
import { parse } from "https://deno.land/std@0.100.0/encoding/toml.ts";

interface Config {
  DomainName: string;
  RR?: string;
  AccessKeyId: string;
  AccessKeySecret: string;
  Endpoint?: string;
  Interval?: number;
  GetIpFrom?: "taobao.com" | "ip.cn";
}

const dir = new URL(".", import.meta.url).pathname;
const config = await Deno.readTextFile(dir + "config.toml");
const {
  DomainName,
  RR = "@",
  AccessKeyId,
  AccessKeySecret,
  Endpoint = "https://alidns.aliyuncs.com/",
  Interval = 10,
  GetIpFrom = "taobao.com",
} = parse(config) as unknown as Config;

if (!DomainName || !AccessKeyId || !AccessKeySecret) {
  console.log("[error] 配置不全");
  Deno.exit(1);
}

function getIp(): Promise<string | void> {
  if (GetIpFrom === "ip.cn")
    return fetch("https://ip.cn/api/index?type=0")
      .then((r) => r.json())
      .then((r) => r.ip);

  return fetch("https://www.taobao.com/help/getip.php")
    .then((r) => r.text())
    .then((r) => r.match(/"(.+)"/)?.[1]);
}

function aliDNS(
  Action: string,
  params: Record<string, string>
): Promise<Record<string, any>> {
  const query = new URLSearchParams({
    Action,
    Format: "JSON",
    Version: "2015-01-09",
    AccessKeyId,
    SignatureMethod: "HMAC-SHA1",
    Timestamp: new Date().toISOString(),
    SignatureVersion: "1.0",
    SignatureNonce: Math.random().toString().slice(2),
    ...params,
  });
  query.sort();
  const msg =
    "GET&%2F&" + encodeURIComponent(query.toString()).replaceAll("*", "%2A");
  const signature = encode(hmac("sha1", `${AccessKeySecret}&`, msg));
  query.append("Signature", signature);
  return fetch(`${Endpoint}?${query}`).then((r) => r.json());
}

async function updateDNS(
  DomainName: string,
  RR: string,
  Value: string
): Promise<string | undefined> {
  const info = await aliDNS("DescribeDomainRecords", { DomainName });
  if (info.Code) return info.Message;
  const list = info.DomainRecords.Record;
  const record = list.find((v: any) => v.RR === RR);

  if (record) {
    const { RecordId, Value: prevValue } = record;
    if (prevValue === Value)
      return `ip (${Value}) 与已存在的解析记录相同，无需更新`;
    const params = { RecordId, RR, Type: "A", Value };
    const res = await aliDNS("UpdateDomainRecord", params);
    if (res.Code) return res.Message;
    return;
  }

  const params = { DomainName, RR, Type: "A", Value };
  const res = await aliDNS("AddDomainRecord", params);
  if (res.Code) return res.Message;
}

let prevIp = "";

async function updateDomain(DomainName: string, RR: string): Promise<string> {
  try {
    const ip = await getIp();
    if (ip && ip === prevIp) {
      return `ip (${ip}) 与前次相同，无需更新`;
    } else if (ip) {
      const res = `更新 ip 成功，${prevIp} -> ${ip}`;
      prevIp = ip;
      const err = await updateDNS(DomainName, RR, ip);
      if (err) return err;
      return res;
    } else {
      return `获取 ip 失败，前次 ip 为 ${prevIp}`;
    }
  } catch (e) {
    return String(e?.message || e);
  }
}

async function run(): Promise<void> {
  const msg = await updateDomain(DomainName, RR);
  if (msg) console.log(msg);
}

run();
setInterval(run, Interval * 60 * 1000);
