import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = "mongodb+srv://annguyen14032004_db_user:rf3IE3SUW0iw27tW@cluster0.ugvzdvo.mongodb.net/NCKH?appName=Cluster0";

async function createAdmin() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to DB');

        const adminSchema = new mongoose.Schema({
            username: { type: String, required: true, unique: true },
            email: { type: String },
            name: { type: String },
            passwordHash: { type: String, required: true },
        }, { timestamps: true });

        const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('Admin123', salt);

        // Remove old broken records
        await Admin.deleteMany({ username: 'admin' });

        // Insert new correct record
        await Admin.create({
            username: 'admin',
            passwordHash: hashedPassword,
            name: 'Super Admin',
            email: 'admin@localhost.com'
        });

        console.log('✅ Admin account admin / Admin123 created successfully with valid passwordHash!');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

createAdmin();
