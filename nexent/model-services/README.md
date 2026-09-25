# Nexent 本地模型服务

本目录记录 Nexent 眼底辅助诊断项目使用的本地模型、重排服务和网络代理配置。模型与大文件统一保存在 D 盘，仓库不包含 Token、患者数据或模型权重。

## 已接入模型

| 模型 | 类型 | Nexent 类型 | 接口 | 设备 |
|---|---|---|---|---|
| `qwen3-vl:4b` | 视觉语言模型 | 图片理解模型 | `http://172.18.0.1:11434/v1` | RTX 5060 GPU |
| `bge-m3` | 多语言向量模型 | 向量模型 | `http://172.18.0.1:11434/v1/embeddings` | RTX 5060 GPU |
| `jina-reranker-v2-base-multilingual` | 多语言重排模型 | 重排模型 | `http://172.18.0.1:8091/v1/rerank` | CPU ONNX |

模型参数：

- VLM：`temperature=0.1`，`top_p=0.8`
- LLM：`temperature=0.1`，`top_p=0.8`
- Embedding 维度：1024
- Reranker 最大文档数：64
- Reranker 输入长度：512 tokens

## D 盘目录

```text
D:\NexentModels\
├── downloads\                 # 安装包
├── install\                   # Ollama 程序
├── ollama\models\             # Ollama 模型
├── reranker\                  # Reranker ONNX 模型
├── runtime\                   # 服务配置和启动脚本
└── samples\                   # 公开影像烟雾测试样本
```

## WSL 自动启动

系统服务：

```text
ollama.service
nexent-rerank.service
nexent-mcp-proxy.service
```

网络关系：

```text
Windows: medical MCP :8090
          ↓ WSL proxy
WSL host: 172.18.0.1:8090
          ↓
Nexent containers
```

Ollama 监听 `0.0.0.0:11434`，Reranker 监听 `0.0.0.0:8091`。

## Windows 自动启动

Windows 启动目录包含 `NexentMedicalMCP.lnk`，调用：

```text
D:\NexentModels\runtime\start-medical-mcp.ps1
```

该脚本检查 `8090` 端口并启动医学 MCP 服务，避免重复进程。

## 安全边界

- VLM 只描述图像可见征象，不输出最终诊断。
- Embedding 和 Reranker 只处理文本知识片段。
- 医学 MCP 需要 Bearer Token。
- 所有模型与缓存位于 D 盘。
- 真实患者数据使用前仍需脱敏和伦理审批。

## 精准度说明

`qwen3-vl:4b` 适合作为影像理解和结构化描述的基础模型，但不能替代专用病灶检测、分割和 DR/AMD 分级模型。后续应接入在公开数据集和医院外部验证集上评估过的眼底专用模型，再用于病灶面积、分级和纵向进展判断。

## Nexent 知识库

- 名称：`眼底医学知识库-v1`
- 内部索引：`1-f4e51a1e512140adabf604da318943fc`
- 向量模型：`bge-m3`
- 当前资料：`02-文献与参考资料.md`
- 当前规模：1 个文档，45 个分块
- 状态：已就绪

当前导入的是文献、指南和数据集索引，适合作为检索骨架。正式诊断知识仍需继续导入授权指南全文、论文全文和结构化疾病知识卡。