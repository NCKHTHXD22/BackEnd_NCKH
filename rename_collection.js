import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;

mongoose.connect(uri).then(async () => {
    try {
        console.log("Connected to MongoDB...");
        const db = mongoose.connection.db;

        // Kiểm tra xem collection cũ có tồn tại không
        const collections = await db.listCollections({ name: 'forecasthistories' }).toArray();
        if (collections.length > 0) {
            await db.collection('forecasthistories').rename('forecasthistories_arimax');
            console.log("✅ Đã đổi tên collection 'forecasthistories' thành 'forecasthistories_arimax' thành công.");
        } else {
            console.log("⚠️ Collection 'forecasthistories' không tồn tại hoặc đã được đổi tên.");
        }
    } catch (err) {
        console.error("❌ Lỗi khi đổi tên collection:", err);
    } finally {
        mongoose.disconnect();
        process.exit(0);
    }
});
