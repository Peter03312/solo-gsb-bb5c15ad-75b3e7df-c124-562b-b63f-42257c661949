# 多色滚筒套准点校核 Web 应用

供印花车间校核 **2～8 个色筒（滚筒）标记点能否在同一匹布上同时对花** 的轻量 Web 工具。
输入各色筒的重复周长、标记偏移与布长，自动计算：

- **首次同时对花位置**（从布头 0 mm 起的最小非负解）；
- **共同重复周期**（各色筒周长的最小公倍数 LCM）；
- 无解时明确指出 **一对互不相容的色筒** 及判定依据；
- 无解时给出 **单色筒偏移修正建议**：逐个尝试只调整某一个色筒的偏移，
  按环形最短位移求出能使全组有解的新偏移（等距时取偏移增大方向），
  点击“采用”仅填入偏移并重新试算，保存仍由原按钮完成；
- **布长内最早的 20 个对花位置**（含距布头、剩余布长）与布长内对花点总数；
- **布面瑕疵避让**：方案可录入至多 20 个禁印区间（闭区间，端点也不可印花），
  试算有解时先合并重叠/相邻区间，再按周期与区间边界以 BigInt 计数扣除落在
  区间内的对花点，给出可用点总数、被排除点数与最早 20 个可用位置；
  区间随方案保存，旧方案缺少该字段时视为空。

技术栈：Node.js + Express + 原生 HTML/CSS/JavaScript（无前端构建步骤）。
方案持久化到本地 JSON 文件，所有整数运算基于 **BigInt**，输入与结果均不受
JavaScript 安全整数范围（2<sup>53</sup>−1）限制。

---

## 一、数学模型

色筒 *i* 的重复周长为 *p<sub>i</sub>*、标记偏移为 *a<sub>i</sub>*（`0 ≤ aᵢ < pᵢ`），
其标记在布面上出现的位置 *x* 满足同余式：

```
x ≡ a₁ (mod p₁)
x ≡ a₂ (mod p₂)
 …
x ≡ aₙ (mod pₙ)      （n = 2～8）
```

该方程组是**广义中国剩余定理（CRT）**：

- **有解** ⇔ 对任意一对色筒 *i, j*，`gcd(pᵢ, pⱼ)` 能整除 `(aᵢ − aⱼ)`。
  有解时所有解构成同余类 `x ≡ x₀ (mod L)`，其中：
  - `x₀` 为首次对花位置（最小非负解）；
  - `L = LCM(p₁,…,pₙ)` 为共同重复周期；
  - 之后的对花点为 `x = x₀ + k·L`（k = 0,1,2,…）。
- **无解** 时，必然存在至少一对色筒不满足上述相容条件，应用直接返回这对色筒、
  两者的 gcd 与偏移差作为证据。

布长内对花点按 **`0 ≤ x ≤ 布长`**（含布头 0 mm 与布长端点）枚举，
总数为 `floor((布长 − x₀)/L) + 1`，页面展示其中最早的 20 个。

### 无解时的单色筒偏移修正建议

方案无解时，应用逐个尝试“只修改色筒 *k* 的偏移、其余色筒保持不动”：

- 若其余 *n*−1 个色筒的同余组 **自身已无解**，色筒 *k* 标记为“不可单独修复”；
- 否则其余色筒的解集为 `x ≡ A (mod M)`（*M* 为其余周长的 LCM）。新偏移 `a′`
  只需满足 `a′ ≡ A (mod g)`（`g = gcd(pₖ, M)`）即可使全组相容。
  调整量 `d = a′ − aₖ` 的候选构成公差为 *g* 的等差类，取其在 `(−g/2, g/2]`
  内的代表元即为 **环形最短位移**（等距 `2·|d| = g` 时取正值，即偏移增大方向）；
  新偏移为 `(aₖ + d) mod pₖ`。该代表元由取模直接得到，无需枚举候选，
  因此 120 位大数周长也能即时给出建议。

建议按 **|调整量| 升序**（相同则按色筒序号升序）列出，不可单独修复的色筒列于其后。

### 布面瑕疵避让（禁印区间）

方案可录入至多 **20 个禁印区间** `[s, e]`（闭区间，**端点同样不可印花**），
需满足 `0 ≤ s ≤ e ≤ 布长`；区间随方案一起保存，旧方案缺少该字段时按空处理。

试算**有解**时按以下步骤扣除（无解时不涉及避让，仍返回原有的冲突证据与
单色筒修正建议）：

1. **合并**：按起点排序后，凡重叠或相邻（`s₂ ≤ e₁ + 1`，整数位置上两区间
   之间已无可落点空隙）的区间合并为一个；
2. **计数扣除**：对每个合并后区间，落在其中的对花点即下标
   `k ∈ [⌈(s−x₀)/L⌉, ⌊(e−x₀)/L⌋] ∩ [0, 总数−1]` 的点；合并后区间互不
   相交，**被排除点数**即各区间计数之和，
   **可用点总数** = 布长内对花点总数 − 被排除点数；
3. **取最早 20 个可用位置**：枚举到禁印区间时按区间终点直接跳到
   `k = ⌊(e−x₀)/L⌋ + 1`，循环次数只与「20 个上限 + 区间个数」有关。

全部计数与跳转均为 BigInt 区间运算，**不按布长或对花点总数逐点扫描**，
因此 120 位大数布长、天文数字级对花点序列也能即时返回。

---

## 二、单条命令启动（Docker Compose，推荐）

前置条件：已安装 Docker 与 Docker Compose 插件。

```bash
docker compose up -d --build
```

启动后浏览器访问：

> **http://localhost:3000**

停止：

```bash
docker compose down
```

### 端口与配置

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| 宿主机端口 | `3000` | 通过环境变量 `PORT` 修改，如 `PORT=8080 docker compose up -d --build` 后访问 http://localhost:8080 |
| 数据文件 | 容器内 `/app/data/schemes.json` | 挂载到宿主机 `./data/schemes.json`，容器删除/重建后方案不丢失 |

> 容器内应用固定监听 3000；`PORT` 只改变宿主机映射端口。

也可直接用 Docker：

```bash
docker build -t roller-registration .
docker run -d --name roller-registration -p 3000:3000 -v "$(pwd)/data:/app/data" roller-registration
```

## 三、本地 Node 直接运行（免 Docker）

要求 Node.js **≥ 18**（内置 BigInt 与全局 fetch）。

```bash
npm install
npm start
```

访问 **http://localhost:3000**。

运行核心算法测试：

```bash
npm test
```

可选环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务监听端口 |
| `DATA_FILE` | `./data/schemes.json` | 方案 JSON 的绝对/相对路径 |

---

## 四、页面使用说明

1. **左侧**为已保存方案列表，点击可载入；“＋ 新建”清空编辑器。
2. **右侧**填写方案名称、2～8 个色筒的重复周长与标记偏移（单位毫米）、布长。
   - 周长为正整数；偏移为非负整数且严格小于周长；布长为非负整数。
   - 可“＋ 添加色筒 / － 删除末个”，数量范围 2～8。
3. **禁印区间（布面瑕疵避让，可选）**：布面有瑕疵段时点击“＋ 添加区间”
   录入起点与终点（闭区间，端点也不可印花，需满足 0 ≤ 起点 ≤ 终点 ≤ 布长），
   至多 20 个，每行可单独“删除”；区间随方案一起保存。
4. 任意输入变化后页面**自动试算**（约 350 ms 防抖），也可点击“重新计算”。
5. 结果区显示首次对花位置、共同重复周期、布长内对花点总数及最早 20 个位置；
   设置了禁印区间时，额外显示**布面瑕疵避让统计**：录入/合并后区间数、
   合并后区间、被排除对花点数、可用对花点总数与最早 20 个可用位置；
   无解时显示一对互不相容色筒及 gcd/偏移差判据，并给出**单色筒偏移修正建议**
   （可修复色筒、原偏移、建议新偏移、有符号调整量）；点击建议行的“采用”
   仅把新偏移填入表单并重新试算，**不会自动保存**，需要保留时再点“保存方案”。
6. “保存方案”保存当前输入（更新正在编辑的方案），“另存为新方案”可复制变体；
   保存后仍可随时修改并再次保存。删除方案需确认。
7. 超过 20 个对花点（或可用点）时，列表只展示最早 20 个，并提示总数等信息。

**精度说明**：所有数字以十进制字符串收发并以 BigInt 计算，页面完整显示全部位数
（加千分位便于阅读），不存在科学计数法或尾数丢失。为防止资源滥用，
单个整数最多 **120 位十进制数字**（周长、偏移、布长均适用）。

---

## 五、HTTP API

基础路径 `http://localhost:3000`，请求/响应均为 JSON；大整数一律为**字符串**。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查，返回 `{"status":"ok"}` |
| `GET` | `/api/schemes` | 方案列表 |
| `GET` | `/api/schemes/:id` | 获取单个方案 |
| `POST` | `/api/solve` | 试算（不保存），返回对花结果 |
| `POST` | `/api/schemes` | 新建方案 |
| `PUT` | `/api/schemes/:id` | 修改方案 |
| `DELETE` | `/api/schemes/:id` | 删除方案 |

请求体示例（`forbiddenIntervals` 可选，至多 20 个；缺省视为空，旧方案无该字段亦按空处理）：

```json
{
  "name": "四色花型 A",
  "clothLength": "100000",
  "rollers": [
    { "perimeter": "640", "offset": "0" },
    { "perimeter": "800", "offset": "0" },
    { "perimeter": "900", "offset": "400" }
  ],
  "forbiddenIntervals": [
    { "start": "30000", "end": "50000" }
  ]
}
```

有解时 `POST /api/solve` 响应（未设置禁印区间时无 `avoidance` 字段）：

```json
{
  "solvable": true,
  "firstPosition": "25600",
  "period": "28800",
  "clothLength": "100000",
  "withinCloth": {
    "total": "3",
    "positions": ["25600", "54400", "83200"],
    "limit": 20
  },
  "avoidance": {
    "inputCount": 1,
    "mergedIntervals": [{ "start": "30000", "end": "50000" }],
    "excluded": "1",
    "usable": "2",
    "positions": ["25600", "83200"],
    "limit": 20
  }
}
```

其中 `avoidance` 为布面瑕疵避让统计：`mergedIntervals` 是合并重叠/相邻后的
禁印区间，`excluded` 为被排除的对花点数，`usable` 为可用点总数，
`positions` 为最早 20 个可用位置（按周期与区间边界计数/跳跃得到，不逐点扫描）。

无解时响应（`suggestions` 为单色筒偏移修正建议，按 |调整量| 及色筒序号排序，
不可单独修复的色筒列于其后；`adjustment` 为带符号十进制字符串）：

```json
{
  "solvable": false,
  "conflict": {
    "rollerA": 1,
    "rollerB": 2,
    "perimeterA": "6",
    "perimeterB": "4",
    "offsetA": "0",
    "offsetB": "3",
    "gcd": "2",
    "offsetDifference": "-3",
    "message": "色筒 1 与色筒 2 互不相容：gcd(6, 4) = 2 不能整除偏移差（0 − 3 = -3），两者的标记永远无法对齐。"
  },
  "suggestions": [
    {
      "roller": 1,
      "fixable": true,
      "perimeter": "6",
      "currentOffset": "0",
      "suggestedOffset": "1",
      "adjustment": "+1"
    },
    {
      "roller": 2,
      "fixable": true,
      "perimeter": "4",
      "currentOffset": "3",
      "suggestedOffset": "0",
      "adjustment": "+1"
    }
  ]
}
```

不可单独修复的色筒在 `suggestions` 中形如 `{"roller": 3, "fixable": false}`。

### curl 速验

```bash
# 有解（超大整数也可直接传字符串）
curl -s -X POST http://localhost:3000/api/solve \
  -H 'Content-Type: application/json' \
  -d '{"clothLength":"99999999999999999999999","rollers":[
       {"perimeter":"123456789012345678901234567891","offset":"0"},
       {"perimeter":"987654321098765432109876543211","offset":"0"}]}'

# 有解 + 布面瑕疵避让（禁印区间）
curl -s -X POST http://localhost:3000/api/solve \
  -H 'Content-Type: application/json' \
  -d '{"clothLength":"100","rollers":[
       {"perimeter":"10","offset":"0"},
       {"perimeter":"20","offset":"0"}],
       "forbiddenIntervals":[{"start":"10","end":"30"},{"start":"55","end":"65"}]}'

# 无解
curl -s -X POST http://localhost:3000/api/solve \
  -H 'Content-Type: application/json' \
  -d '{"clothLength":"1000","rollers":[
       {"perimeter":"6","offset":"0"},
       {"perimeter":"4","offset":"3"}]}'
```

---

## 六、项目结构

```
.
├── Dockerfile               # 生产镜像（node:20-alpine，非 root 运行，含 healthcheck）
├── docker-compose.yml       # 单命令启动；端口与数据卷配置
├── .dockerignore
├── package.json
├── server.js                # Express 入口（静态页 + REST API）
├── lib/
│   ├── crt.js               # 广义 CRT 同余合并 / LCM / 布长内枚举 / 禁印区间合并与扣除 / 单色筒修正建议（BigInt）
│   ├── validation.js        # 入参校验（位数、正整数、偏移<周长、禁印区间 0≤起点≤终点≤布长且至多 20 个）
│   ├── solver.js            # 求解服务编排与字符串序列化
│   └── store.js             # 本地 JSON 原子读写（临时文件 + rename）
├── public/
│   ├── index.html           # 单页界面
│   ├── styles.css
│   └── app.js               # 原生 JS：编辑、自动试算、方案增删改
├── test/
│   └── math.test.js         # 零依赖断言测试（含超 2^53 用例）
└── data/
    └── schemes.json         # 运行后生成，方案持久化
```

## 七、常见问题

- **偏移量 0 是什么意思？** 表示该色筒的基准标记恰好在布头处（其标记点为周长的整数倍）。
- **为什么布长端点也可能出现对花点？** 应用按闭区间 `0 ≤ x ≤ 布长` 枚举；
  若布长恰好等于某个对花位置，该点计入（车间可据此判断末段是否还能对上一次花）。
- **数据会发到外部吗？** 不会。所有计算在本应用进程内完成，方案只写入本地 JSON 文件。
