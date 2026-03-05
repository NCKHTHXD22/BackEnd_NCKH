import { connectDB } from "../api/config/database.js";
import Admin from "../core/entities/Admin.js";
import mongoose from "mongoose";

const createAdmin = async () => {
    try {
        await connectDB();

        const username = "Admin123";
        const password = "Admin123Password"; // Recommendation: Change after login

        const exists = await Admin.findOne({ username });
        if (exists) {
            console.log(`Admin user "${username}" already exists.`);
            process.exit(0);
        }

        const admin = new Admin({
            username: username,
            email: "admin@example.com",
            name: "System Administrator"
        });

        await admin.setPassword(password);
        await admin.save();

        console.log(`✅ Admin account created successfully!`);
        console.log(`Username: ${username}`);
        console.log(`Password: ${password}`);

        process.exit(0);
    } catch (err) {
        console.error("❌ Error creating admin account:", err.message);
        process.exit(1);
    }
};

createAdmin();
