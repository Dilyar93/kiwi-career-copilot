SEEK Job Application Copilot
V2.0 Agentic Upgrade Proposal
1. 项目概述

项目暂定名：

SEEK Job Application Copilot

定位：

一个以 SEEK 为主要入口、运行在本地的开源 Agentic Job Application Copilot。它理解用户的个人背景、技能、签证、时间安排和求职偏好，在用户浏览职位、判断岗位、准备申请材料以及填写申请表时提供连续协助。

现有 V1.0 已经解决了 SEEK 原生搜索的一个实际痛点：

SEEK 可以描述“我想找什么”，但不方便描述“我不想看到什么”。

V1.0 目前已有的能力包括：

模块	当前能力
Keyword exclusion	根据用户设置的关键词隐藏不感兴趣职位
Job hiding	维护不希望看到的职位
Distance filtering	根据距离过滤职位
Chrome Extension	直接集成在 SEEK 浏览体验中
Local usage	当前主要功能在本地执行

V2.0 不重写这些功能，而是在此基础上加入一个新的 AI Application Agent Layer。

2. V2.0 要解决的真实问题

职位过滤只是求职流程的第一步。

找到职位以后，目前仍需要人工完成大量重复工作：

发现职位
    ↓
读完整 JD
    ↓
判断值不值得投
    ↓
检查技能匹配
    ↓
检查 work rights
    ↓
检查工作时间是否和课程冲突
    ↓
判断地点是否可以接受
    ↓
判断 CV 是否需要针对性修改
    ↓
生成 targeted CV
    ↓
写 cover letter
    ↓
点击 Apply
    ↓
填写大量重复字段
    ↓
回答 job-specific questions
    ↓
记录申请状态

V2.0 的目标不是简单地：

JD + CV → GPT → 8.5/10

而是：

让一个具备长期个人上下文、工具调用能力和动态决策能力的 Agent 帮助用户完成从“看到岗位”到“准备好提交申请”的整个流程。

最终提交仍然由用户完成。

3. 核心产品原则
Local-first

用户的 CV、签证信息、课表、个人资料和申请历史默认保存在本机。

第一阶段不做：

用户账号
云端数据库
SaaS
Chrome Web Store 发布
多用户
付费系统

V2.0 首先服务于：

单一真实用户 + 本地环境 + 开源项目。

Human-in-the-loop

Agent 可以：

分析、建议、生成、填写。

但不自动：

提交申请。

特别是以下内容必须由用户确认：

Criminal history
Medical disclosure
Citizenship
Conflict of interest
Salary-sensitive questions
Legal declarations
Final application submission
Evidence-grounded generation

Agent 禁止编造用户经历。

例如 JD 要求 OpenCV，而 Candidate Knowledge Base 中没有 OpenCV：

正确：
Gap: No demonstrated OpenCV experience.

错误：
Skill: OpenCV

所有用于 CV / cover letter 的经历应尽可能追踪到已有 evidence。

4. V2.0 产品流程

整体用户体验：

SEEK LIST PAGE
      │
      │ V1 existing filters
      ▼
Filtered Jobs
      │
      ▼
JOB DETAIL PAGE
      │
      │ [Analyse Job]
      ▼
┌────────────────────────┐
│ Job Application Agent  │
└────────────────────────┘
      │
      ├── Read Job
      ├── Read Candidate Profile
      ├── Check Work Rights
      ├── Check Availability
      ├── Check Skills
      ├── Check Portfolio
      ├── Check Application History
      │
      ▼
Dynamic Decision
      │
      ├── APPLY
      ├── MAYBE
      └── SKIP
      │
      ▼
If APPLY
      │
      ├── Current CV OK
      ├── Tailor CV
      ├── Generate Cover Letter
      ├── Need Transcript
      ├── Need Portfolio
      └── Need clarification
      │
      ▼
User clicks Apply
      │
      ▼
External ATS / Careers Site
      │
      │ [Assist Application]
      ▼
Scan Form
      │
      ├── Known answers
      ├── Job-specific answers
      ├── Unknown answers
      └── Sensitive declarations
      │
      ▼
User Review
      │
      ▼
Fill Approved Fields
      │
      ▼
USER SUBMITS
5. 为什么这是 Agent，而不是普通 Workflow

普通 workflow 是固定的：

Read JD
→ Compare CV
→ Score
→ Generate Cover Letter

每一个职位都走相同路径。

V2.0 Agent 的行为应该取决于当前 observation。

例如：

Case A — Work-rights blocker

Agent 发现：

Job:
NZ Citizen / Permanent Resident only

Candidate:
Student Visa

下一步：

Stop detailed CV analysis
→ classify potential hard blocker
→ optionally verify employer source
→ recommend SKIP

不需要继续浪费时间生成 CV。

Case B — Portfolio requirement

岗位要求：

Show us an automation or AI agent you have built.

Agent发现 candidate portfolio 不满足。

下一步不是：

修改 CV。

而是：

Fit: High
Application readiness: Medium
Missing evidence: Relevant AI/automation project
Recommended action: complete portfolio project before applying.

Case C — 时间冲突

岗位：

40 hours/week
Start: 1 November

Candidate：

Study period work limit: 25h
Scheduled vacation begins later

Agent调用 availability/work-rights tool。

如果存在冲突：

⚠ Start date may be incompatible with current work rights.

所以 Agent 的职责是：

决定下一步应该调用哪个能力，而不是亲自完成所有事情。

CV generation、PDF rendering、work-right calculation 等可以继续使用 deterministic workflow。

6. Agent 的核心 Tools

第一版建议限制在 8–10 个 tool，避免一开始过度设计。

read_current_job()

从当前网页读取职位信息。

输出结构化 JobPosting。

get_candidate_profile()

读取用户长期个人资料。

check_work_eligibility(job)

结合：

visa
weekly hours
employment type
job dates
study/summer status

进行确定性规则判断。

check_availability(job)

结合用户 availability / timetable 判断时间是否匹配。

第一版可以先使用手工结构化 availability，不必解析课表 PDF。

search_candidate_evidence(query)

搜索用户已有经历、技能、项目。

初版可直接查询结构化数据。

后续升级为 RAG。

check_application_history(job)

例如：

Already applied on 4 Sep 2026.

防止重复分析/申请。

create_cv_change_plan(job)

注意：

它不直接写 PDF。

输出：

{
  "profile": {
    "action": "modify"
  },
  "skills": {
    "highlight": ["Python", "LLM evaluation"]
  },
  "experience": {
    "highlight": [
      "baidu.llm_evaluation_platform",
      "baidu.workflow_development"
    ]
  }
}
generate_targeted_cv(change_plan)

负责 deterministic rendering。

generate_cover_letter(job, evidence)

生成 role-specific cover letter。

save_application_state()

记录：

Job
Recommendation
CV version
Cover letter
status
date
outstanding actions
7. Candidate Memory

第一版不使用复杂 Agent memory framework。

直接 SQLite。

建议数据模型：

CandidateProfile
├── Personal
├── Education
├── Skills
├── Experience
├── Projects
├── WorkRights
├── Availability
├── LocationPreferences
├── DriverLicence
└── JobPreferences

例如：

{
  "skills": {
    "python": {
      "level": "proficient"
    },
    "numpy": {
      "level": "basic"
    },
    "opencv": {
      "level": "none"
    },
    "git": {
      "level": "proficient"
    },
    "linux": {
      "level": "proficient"
    }
  }
}

而不是让 LLM 每次从 CV 猜。

8. 求职模式 Job Mode

这是一个非常值得做的功能。

因为学生在不同时间找的职位类型不同。

例如：

Semester Mode
{
  "target": [
    "part-time"
  ],
  "max_hours": 25,
  "preferred_location": [
    "Hamilton"
  ]
}
Summer Mode
{
  "target": [
    "internship",
    "full-time fixed-term"
  ],
  "hours": "full-time",
  "locations": [
    "Hamilton",
    "Tauranga",
    "Auckland",
    "Christchurch"
  ]
}

于是：

同一个 40h/week 岗位：

Semester Mode：

Low priority / incompatible.

Summer Mode：

Suitable.

这会让 AI 真正利用用户 context，而不是只做 JD-CV similarity。

9. RAG 设计

RAG 不是 V2.0 第一阶段的强制功能。

建议等基础 Agent 跑通以后作为 V2.1。

RAG 适合处理：

Master CV
Previous CVs
Project README
Research papers
Course descriptions
Previous cover letters
Previous application answers
Portfolio documentation

用户上传以后形成：

Candidate Evidence Library

例如 JD 要求：

software testing

Agent：

retrieve("evidence of software testing")

返回：

Baidu NLP Engineering Intern

- software testing
- defect identification
- test-case design
- quality checks

于是 targeted CV 可以引用这些真实 evidence。

不应该 RAG 的内容

这些应该结构化存储：

Visa expiry
Weekly work limit
Location
Skills level
Driver licence
Relocation preference
University completion date
Weekly availability

不要用 embedding 检索这种确定性事实。

原则：

Structured facts → database

Unstructured experience evidence → RAG

10. 用户上传资料

未来可以支持：

Master CV

解析：

Profile
Skills
Experience
Education
Projects
Languages
Work rights

同时保留原文作为 evidence source。

Existing application materials

例如：

Previous CV
Cover letter
Project README
Research papers

进入 RAG evidence library。

Timetable

第一阶段：

手工填写 availability。

第二阶段：

上传 timetable → parse → 用户确认 → 结构化保存。

不要每次用 RAG 查询 timetable PDF。

Visa

同理。

第一阶段：

用户手工填写结构化 work rights。

后续：

上传 visa → extraction → user confirmation → structured storage。

原始 PDF 不需要反复送入 LLM。

11. Job Analysis 输出设计

不要只输出：

Match: 82%

建议：

RECOMMENDATION
APPLY

FIT
High

APPLICATION READINESS
Medium

STRONG MATCHES
• Backend engineering
• Python
• LLM evaluation
• Workflow development

PARTIAL MATCHES
• AI automation

GAPS
• Power Automate
• Power BI

HARD BLOCKERS
None detected

UNKNOWN
• Exact internship start date

CV
Tailoring recommended
Profile + Skills only

COVER LETTER
Recommended

PORTFOLIO
Current project evidence is sufficient

NEXT ACTION
Generate targeted CV and cover letter

重点：

Fit 和 Application Readiness 是两个不同概念。

Harkness：

Fit = High
Readiness = Medium

如果 portfolio 尚未准备好。

12. Targeted CV Generator

第一版不需要编辑 FlowCV PDF。

建议维护：

Master Candidate Data
      ↓
CV Change Plan
      ↓
ATS-friendly HTML Template
      ↓
PDF

重点不是视觉设计，而是：

能稳定生成真实、针对性、无 hallucination 的 CV。

规则：

Never add a skill absent from Candidate Knowledge Base.

Never create achievements or metrics without evidence.

Prefer reordering/highlighting over rewriting experience.

Preserve unrelated sections where possible.
13. Evidence Provenance

这是一个很值得加入的工程功能。

例如生成：

Developed reusable evaluation workflows…

内部保存：

{
  "generated_text": "...",
  "evidence": [
    "experience.baidu_senior.bullet_3"
  ]
}

如果生成内容：

Experienced with OpenCV

系统找不到 evidence：

BLOCK GENERATION
Reason: unsupported candidate claim

项目 README 可以把这个特性称为：

Evidence-grounded application generation

14. Cover Letter Generator

不要直接：

JD + CV → Write cover letter.

应该：

Job analysis
       ↓
Relevant evidence retrieval
       ↓
Candidate motivation
       ↓
Known gaps
       ↓
Cover letter generation

例如：

{
  "evidence": [
    "baidu.llm_platform",
    "seek.chrome_extension"
  ],
  "motivation": [
    "applied AI",
    "automation"
  ],
  "avoid_claims": [
    "Power Automate experience"
  ]
}

然后才生成。

15. Application Form Agent

用户点击：

Assist Application

插件扫描当前网页。

输出类似：

17 fields detected

Known from profile:       9
Job-specific:             4
Needs confirmation:       3
Unknown:                  1
Known fields

例如：

Current location
→ Hamilton, New Zealand

Visa expiry
→ 26 March 2027

可以直接预填。

Job-specific

例如：

Why are you interested in this role?

Agent根据：

JD
relevant evidence
company
candidate motivation

生成答案。

用户可以：

Accept
Edit
Regenerate
Fill

Unknown

例如第一次遇到：

Do you hold a driver's licence?

Memory 不存在。

Agent：

I don't have this information yet.

用户：

Yes, Chinese passenger vehicle licence valid in NZ.

Agent：

Save this to my profile?

用户确认后写入 memory。

以后不再询问。

Sensitive declarations

例如：

Criminal convictions?

Agent不得根据空值自动判断 No。

必须：

Please confirm.

16. 动态网页处理

SEEK 和 ATS 经常不是完整静态页面。

需要处理：

Job list
→ click
→ DOM changes
→ job panel updates

Chrome Extension 使用：

MutationObserver

检测当前 job 是否改变。

如果发现：

Show more

第一版：

提醒用户展开。

后续可以给 Agent tool：

expand_job_description()
17. External ATS

点击 Apply 后可能进入：

Workday
Employment Hero
Greenhouse
Lever
Company career sites

V2 MVP 不需要专门适配全部平台。

使用：

activeTab

用户进入页面后主动点击：

Assist Application

Generic Form Parser 尝试读取：

input
textarea
select
radio
checkbox
label

以后再增加：

GenericAdapter
WorkdayAdapter
EmploymentHeroAdapter
GreenhouseAdapter
18. Privacy Architecture

第一版：

Chrome Extension
       ↓
localhost
       ↓
Local Agent Server
       ↓
LLM API

本地保存：

CV
Visa data
Timetable
Application history
Candidate profile
Projects

Cloud LLM 只获得当前任务需要的最少 context。

例如判断岗位：

JD
+
relevant candidate evidence
+
structured work-right summary

而不是：

整份 visa PDF + 地址 + 电话 + 所有 CV。

19. 推荐技术架构

考虑到你已有工程背景，也考虑到 Harkness 的岗位技术方向：

Extension
TypeScript
React
Chrome Extension Manifest V3
Local Agent Server

建议：

Python
FastAPI

原因：

你 Python 熟悉；
AI ecosystem 成熟；
iteration 快。
Storage

V2：

SQLite

不需要 Supabase。

LLM Provider

抽象：

class LLMProvider:
    async def generate(...)
    async def tool_call(...)

实现：

Anthropic
OpenAI
Ollama

用户通过 .env 配置。

20. Repository Structure

建议：

seek-job-copilot/
│
├── extension/
│   ├── src/
│   │   ├── seek/
│   │   ├── forms/
│   │   ├── sidepanel/
│   │   └── api/
│   └── manifest.json
│
├── agent/
│   ├── api/
│   ├── planner/
│   ├── tools/
│   ├── providers/
│   ├── memory/
│   └── prompts/
│
├── candidate/
│   ├── models/
│   └── example-profile.json
│
├── cv/
│   ├── generator/
│   └── templates/
│
├── rag/
│   ├── ingestion/
│   └── retrieval/
│
├── evaluation/
│   ├── jobs/
│   ├── expected/
│   └── runner/
│
├── docs/
│   ├── architecture.md
│   ├── privacy.md
│   └── agent-design.md
│
├── .env.example
├── .gitignore
├── README.md
└── LICENSE

你的真实个人资料必须全部 .gitignore。

公开 repo 使用虚构 candidate。

21. Evaluation

这是整个项目非常重要的一部分。

你已经天然拥有一批真实 test cases。

可以匿名化：

LIC ML
LIC Calf Data
TEG
ZURU
Microchip
SYOS
Gallagher
SKOPE
BOPRC
Rocketspark
Harkness

建立人工 ground truth：

{
  "recommendation": "skip",
  "hard_blocker": "citizen_or_pr_only",
  "cv_tailoring": false
}

或者：

{
  "recommendation": "apply",
  "hard_blocker": null,
  "cv_tailoring": true,
  "relevant_evidence": [
    "llm_evaluation",
    "workflow_development"
  ]
}

评价指标可以包括：

Metric	Meaning
Hard blocker accuracy	是否正确识别 citizenship/work-right/time 等 blocker
Apply/Maybe/Skip agreement	与人工判断的一致度
Requirement extraction	是否正确理解 JD
Evidence precision	使用的 candidate evidence 是否真实相关
Unsupported claim rate	是否编造用户技能
CV tailoring relevance	改动是否真正针对 JD
Form answer accuracy	是否正确回答表单事实字段

一个非常重要的 metric：

Unsupported Candidate Claim Rate = 0

这是项目质量目标之一。

22. Development Phases
V2.0 — Core MVP

目标：

完成从 Job Analysis 到 Application Preparation 的闭环。

实现：

Existing SEEK filters
+
Analyse Job
+
Structured Candidate Profile
+
Agent tool loop
+
Work-right checks
+
Apply/Maybe/Skip
+
CV change plan
+
Targeted CV generation
+
Cover letter
+
Application state
V2.1 — Application Assistant

增加：

Form detection
Known-field autofill
Job-specific answer generation
Unknown field clarification
Sensitive field confirmation
V2.2 — Evidence RAG

增加：

Upload CV
Upload project documents
Upload previous applications
Evidence retrieval
Citation/provenance
V2.3 — Availability Intelligence

增加：

Timetable parsing
Semester/summer mode
Study periods
Scheduled vacations
Availability conflict detection
V2.4 — Web Research Tools

Agent 可根据需要：

check employer careers page
verify work-right requirement
find full JD
check missing job information

注意：

不是每个职位都搜索互联网。

只有 Agent 判断信息不足时才调用。

23. V2.0 明确不做什么

为了防止 Codex scope explosion：

V2.0 不做：

Multi-agent
自动 Submit
全自动网站操作
SaaS
用户账号
Supabase
payment
Chrome Store 发布
vector DB
全平台 ATS adapter
自动邮件发送
自动投递几十个职位
autonomous mass application

这是一个：

Personal Job Application Copilot

不是：

“全自动海投机器人”。

24. MVP Acceptance Criteria

V2.0 被认为完成，需要能够真实完成一次：

Open SEEK
    ↓
Current V1 filters work
    ↓
Open job
    ↓
Click Analyse Job
    ↓
Agent returns:
Apply / Maybe / Skip
    ↓
Explains:
matches / gaps / blocker
    ↓
If Apply:
determines CV action
    ↓
Generates targeted CV
    ↓
Generates cover letter
    ↓
Saves application

并且：

生成内容中不存在未经 evidence 支持的 candidate claim。

V2.1 完成标准：

Open external application form
    ↓
Click Assist Application
    ↓
Fields detected
    ↓
Known facts populated
    ↓
Unknown facts asked
    ↓
Job-specific answers generated
    ↓
Sensitive answers require confirmation
    ↓
Approved fields filled
    ↓
User manually submits
25. 给 Codex 的实施指令

你之后把现有 V1.0 repo 给 Codex 时，可以把下面这一段和本企划一起给它：

Implementation instruction

Treat the existing repository as V1.0 and preserve all currently working SEEK filtering functionality. Do not rewrite the extension from scratch unless necessary.

First inspect the existing architecture, manifest, state management, DOM integration and filtering implementation.

Propose an incremental migration plan from V1.0 to V2.0 based on the attached product specification.

Before writing code:

Document the existing architecture.
Identify reusable components.
Identify technical debt that blocks V2.
Propose the minimum architecture required for the V2.0 Core MVP.
Break the work into small independently testable milestones.

Prioritise a working vertical slice over infrastructure.

The first vertical slice should be:

Current SEEK job → Analyse Job → local agent service → candidate profile → structured recommendation displayed in extension side panel.

Do not implement RAG, multi-agent architecture, timetable ingestion, advanced ATS adapters or cloud persistence until the core vertical slice works.

The system must remain local-first and open-source.

Candidate data must not be committed to Git.

Generated CV and application content must be evidence-grounded and must never invent candidate experience.

Sensitive declarations and final application submission must always remain human-controlled.