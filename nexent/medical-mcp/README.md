# Nexent 眼底医学 MCP 插件

本项目提供一个本地运行的 MCP Streamable HTTP 服务，为 Nexent 提供医学文献、病历文档、脱敏和眼底模型代理能力。

## 已提供工具

| 工具 | 用途 |
|---|---|
| `health_check` | 检查插件和模型代理状态 |
| `pubmed_search` | 检索 PubMed 论文 |
| `pubmed_fetch` | 获取 PubMed 摘要 |
| `deidentify_medical_text` | 病历文本 PHI 脱敏和风险提示 |
| `dicom_metadata_inspect` | DICOM 元数据与 PHI 字段检查 |
| `extract_pdf_text` | 提取可搜索 PDF 文本 |
| `ocr_medical_image` | 本地 Tesseract OCR |
| `build_case_timeline` | 按时间整理检查、检验和随访事件 |
| `fundus_model_infer` | 将脱敏影像和临床上下文转发到眼底模型 |

## 安全边界

- 不在服务端持久化患者数据。
- 通过 `MCP_AUTH_TOKEN` 启用 Bearer Token 验证。
- 本地文件访问受 `MEDICAL_MCP_ALLOWED_ROOT` 限制。
- OCR 和正则脱敏结果必须由医生复核。
- `fundus_model_infer` 需要另行配置内部模型地址。

## 本地运行

```bash
npm ci
cp .env.example .env
# 编辑 .env，生成高强度 MCP_AUTH_TOKEN
npm start
```

Nexent 中填写：

- 服务器名称：`fundus_medical_mcp`
- 服务器 URL：Nexent 容器可访问的地址，例如 `http://172.18.0.1:8090/mcp`
- Bearer Token：填写完整的 `Bearer <MCP_AUTH_TOKEN>`

注意：Nexent 当前不会自动补充 `Bearer` 前缀，因此表单内必须填写完整的 `Bearer ...`。

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `PORT` | 否 | 默认 8090 |
| `HOST` | 否 | 默认 0.0.0.0 |
| `MCP_PATH` | 否 | 默认 `/mcp` |
| `MCP_AUTH_TOKEN` | 是 | 访问令牌，不能提交到 Git |
| `MEDICAL_MCP_ALLOWED_ROOT` | 是 | 允许读取的本地目录 |
| `NCBI_API_KEY` | 否 | 提高 PubMed 请求限额 |
| `NCBI_EMAIL` | 否 | NCBI 联系邮箱 |
| `FUNDUS_MODEL_API_URL` | 条件 | 眼底模型推理接口 |
| `FUNDUS_MODEL_API_KEY` | 条件 | 眼底模型接口密钥 |
| `FUNDUS_MODEL_NAME` | 否 | 模型名称 |

## Docker

```bash
docker build -t nexent-fundus-medical-mcp:0.1.0 .
docker run -d --name nexent-fundus-medical-mcp \
  --restart unless-stopped \
  --network nexent_network \
  --env-file .env \
  nexent-fundus-medical-mcp:0.1.0
```

容器加入 `nexent_network` 后，Nexent 可使用 `http://nexent-fundus-medical-mcp:8090/mcp`。
