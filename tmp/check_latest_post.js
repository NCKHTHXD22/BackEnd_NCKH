import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const postSchema = new mongoose.Schema({}, { strict: false });
const Post = mongoose.model('Post', postSchema, 'posts');

async function checkLatestPost() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const latestPost = await Post.findOne().sort({ createdAt: -1 });
        console.log("Latest Post AI Data:");
        console.log("Image URL:", latestPost.imageUrls?.[0]);
        console.log("aiProcessed:", latestPost.aiProcessed);
        console.log("aiLabel:", latestPost.aiLabel);
        console.log("aiScore:", latestPost.aiScore);
        console.log("aiFloodLevel:", latestPost.aiFloodLevel);
    } catch (e) {
        console.error(e);
    } finally {
        mongoose.disconnect();
    }
}

checkLatestPost();
