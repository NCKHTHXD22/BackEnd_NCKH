import express from "express";
import { sendChatMessage } from "../controller/chatbot.controller.js";
import { chatbotLimit } from "../middlewares/rateLimit.middleware.js";

const router = express.Router();

router.post("/message", chatbotLimit, sendChatMessage);

export default router;
