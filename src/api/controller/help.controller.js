import { helpRepo } from "../../infrastructure/repositories/help.repo.js";
import { userRepo } from "../../infrastructure/repositories/user.repo.js";
import cloudinary from "../config/cloudinary.js";

export const createHelpRequest = async (req, res) => {
    try {
        const clerkId = req.auth.userId;

        const user = await userRepo.findByClerkId(clerkId);
        if (!user) return res.status(404).json({ message: "User not found" });

        const { description, what3words, address, location } = req.body;

        if (!description || !address || !location) {
            return res.status(400).json({ error: "Thiếu dữ liệu bắt buộc" });
        }

        let imageUrls = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const result = await cloudinary.uploader.upload(file.path, {
                    folder: "help_images",
                });
                imageUrls.push(result.secure_url);
            }
        }

        const help = await helpRepo.create({
            user: user._id,
            description,
            what3words,
            address: typeof address === "string" ? JSON.parse(address) : address,
            location: typeof location === "string" ? JSON.parse(location) : location,
            imageUrls,
        });

        res.status(201).json(help);
    } catch (err) {
        res.status(500).json({ error: "Lỗi server" });
    }
};

export const getAllHelpRequests = async (req, res) => {
    try {
        const helps = await helpRepo.model.find()
            .populate("user", "name email phone")
            .sort({ createdAt: -1 });

        res.status(200).json(helps);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const getUserHelpRequests = async (req, res) => {
    try {
        const clerkId = req.auth.userId;

        const user = await userRepo.findByClerkId(clerkId);
        if (!user) return res.status(404).json({ message: "User not found" });

        const helps = await helpRepo.findAll({ user: user._id });
        res.status(200).json(helps);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
