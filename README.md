# 🐟 fishGuide AI 语音导游

fishGuide 是我自制的基于 AI 的智能语音导游聊天应用，支持用户以聊天的形式，告诉模型想要的参观路线和导览风格，获取个性化的博物馆/景点讲解体验。

fishGuide is an AI-powered smart audio tour guide. Users can freely input a list of spots/museums they want to visit, specify their preferred tour style, length, and any other requirements. The agent will automatically extract your route spots, reference Wikipedia for introductions, and generate a personalized audio tour in one go.

---

## 主要功能 | Main Features

- 🗺️ **自由路线定制**：用户可输入任意多个景点/博物馆，系统自动识别并规划参观顺序。

  **Customizable routes**: Input any number of spots/museums, the system will extract and plan your visit order.

- 🎙️ **个性化语音导览生成**：支持自定义导览风格、时长、深度等，AI 会根据你的要求和维基百科等权威资料自动生成讲解音频。

  **Personalized audio tour**: Specify your preferred style, length, and depth. The AI generates audio guides referencing Wikipedia and your requirements.

- 🧑‍💻 **多用户会话与历史音频管理**：基于 sessionId 区分用户，用户可在聊天界面右上角查看和播放所有历史音频。

  **Multi-user session & audio history**: Each user is identified by sessionId. All previous audio guides are accessible and playable from the chat UI.

---

## 快速开始 | Quick Start

1. 安装依赖 Install dependencies:
   ```bash
   npm install
   ```
2. 配置环境变量 Set up environment variables:
   在 `.dev.vars` 文件中添加你的 OpenAI API Key，并且在server.ts里设置你使用的模型：
   ```env
   OPENAI_API_KEY=your_openai_api_key
   ```
3. 本地运行 Run locally:
   ```bash
   npm start
   ```
4. 部署 Deploy:
   ```bash
   npm run deploy
   ```

---

## 项目结构 | Project Structure

```
src/
  app.tsx        # 聊天界面 Chat UI
  server.ts      # Agent 逻辑 Agent logic
  tools.ts       # 工具定义 Tool definitions
  utils.ts       # 辅助函数 Utilities
  styles.css     # 样式 Styling
  components/    # UI 组件库 UI components
```

---

## 后续开发计划 | Roadmap

- 🗺️ **旅游路线智能规划：目前已支持伦敦地区的citywalk路线规划**
  - 接受历史时期和风格参数，调用RAG，生成最优旅游路线
  - 集成谷歌地图 API，展示沿途路线，支持点击途径点展示位置信息

  **Travel route planning**: Integrate Google Maps API for optimal route generation.

- 📚 **基于RAG的讲解词生成：目前已经完成伦敦地区RAG数据库的接入**
  - 未来可能支持基于外部知识库的检索增强讲解

  **RAG-powered explanations (planned)**: Potential support for retrieval-augmented generation from external knowledge bases.

- 💰 **自然语言旅游账本（计划中）**
  - 未来可能支持用自然语言记账、生成旅游花销报告

  **Natural language travel ledger (planned)**: Possible support for expense tracking and reporting via natural language.

---

## License

MIT
