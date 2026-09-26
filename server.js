/**
 * server.js —— Express 服务入口
 *
 * 提供方案的增删改查（持久化到本地 JSON 文件）与求解接口，
 * 并托管 public/ 下的原生 JavaScript 前端页面。
 *
 * 环境变量：
 *   PORT      监听端口，默认 3000
 *   DATA_FILE 方案 JSON 文件路径，默认 ./data/schemes.json
 */

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadSchemes,
  createScheme,
  updateScheme,
  deleteScheme,
} from './lib/store.js';
import { solveBody } from './lib/solver.js';
import { validateScheme } from './lib/validation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
// 大整数以字符串传输，JSON 体本身很小，1mb 上限足够。
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/** 方案列表 */
app.get('/api/schemes', (_req, res) => {
  try {
    res.json(loadSchemes());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** 单个方案 */
app.get('/api/schemes/:id', (req, res) => {
  const scheme = loadSchemes().find((s) => s.id === req.params.id);
  if (!scheme) return res.status(404).json({ error: '方案不存在' });
  res.json(scheme);
});

/** 试算（不保存）：页面每次修改后即时查看结果 */
app.post('/api/solve', (req, res) => {
  const out = solveBody(req.body);
  if (!out.ok) return res.status(out.status).json({ error: out.error });
  res.json(out.result);
});

/** 新建方案 */
app.post('/api/schemes', (req, res) => {
  const checked = validateScheme(req.body);
  if (!checked.ok) return res.status(400).json({ error: checked.error });
  try {
    const scheme = createScheme(checked.data);
    res.status(201).json(scheme);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** 修改方案 */
app.put('/api/schemes/:id', (req, res) => {
  const checked = validateScheme(req.body);
  if (!checked.ok) return res.status(400).json({ error: checked.error });
  try {
    const scheme = updateScheme(req.params.id, checked.data);
    if (!scheme) return res.status(404).json({ error: '方案不存在' });
    res.json(scheme);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** 删除方案 */
app.delete('/api/schemes/:id', (req, res) => {
  try {
    const ok = deleteScheme(req.params.id);
    if (!ok) return res.status(404).json({ error: '方案不存在' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 统一兜底错误处理（JSON 解析失败等）。
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '请求体不是合法的 JSON' });
  }
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`多色滚筒套准校核应用已启动：http://localhost:${PORT}`);
});
