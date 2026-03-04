import React, { useEffect, useState } from "react";
import postsApi from "../../api/postsApi";
import PostCard from "../../components/Admin/AdminPage/DataTablePostWait";

export default function ReportsPublic(){
  const [posts,setPosts]=useState([]);
  useEffect(()=>{ (async()=>{ try{ const r = await postsApi.getPublicPosts(); setPosts(r.data||[]); }catch(e){console.error(e);} })(); }, []);
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Các phản ánh đã được duyệt</h2>
      <div className="space-y-4">
        {posts.map(p => <PostCard key={p._id} p={p} />)}
      </div>
    </div>
  );
}
