import React, { useState } from "react";
import postsApi from "../../api/postsApi";

export default function SubmitReport(){
  const [location,setLocation]=useState({province:"Đà Nẵng",district:"",address:""});
  const [floodLevel,setFloodLevel]=useState("");
  const [areaType,setAreaType]=useState("Ngoài đường");
  const [description,setDescription]=useState("");
  const [files,setFiles]=useState([]);

  const clerkToken = localStorage.getItem("clerkToken"); // optional

  const onFiles = (e) => setFiles([...files, ...Array.from(e.target.files)]);

  const submit = async (e) => {
    e.preventDefault();
    if (!clerkToken) return alert("Submit từ web yêu cầu Clerk token. Nếu chưa cấu hình, dùng app mobile.");
    const form = new FormData();
    form.append("location", JSON.stringify(location));
    form.append("floodLevel", floodLevel);
    form.append("areaType", areaType);
    form.append("floodTime", new Date().toISOString());
    form.append("description", description);
    files.forEach(f => form.append("images", f));
    try {
      await postsApi.createPost(form, clerkToken);
      alert("Gửi thành công — chờ duyệt");
    } catch (err) { console.error(err); alert("Gửi thất bại"); }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Gửi phản ánh</h2>
      <form onSubmit={submit} className="space-y-3">
        <input className="w-full border p-2" placeholder="Quận/Huyện" value={location.district} onChange={e=>setLocation({...location,district:e.target.value})} />
        <input className="w-full border p-2" placeholder="Địa chỉ" value={location.address} onChange={e=>setLocation({...location,address:e.target.value})} />
        <input className="w-full border p-2" placeholder="Mức ngập (cm)" value={floodLevel} onChange={e=>setFloodLevel(e.target.value)} />
        <select className="w-full border p-2" value={areaType} onChange={e=>setAreaType(e.target.value)}>
          <option>Ngoài đường</option>
          <option>Trong nhà</option>
          <option>Khu vực khác</option>
        </select>
        <textarea className="w-full border p-2" placeholder="Mô tả" value={description} onChange={e=>setDescription(e.target.value)} />
        <input type="file" multiple onChange={onFiles} />
        <button className="bg-blue-600 text-white px-4 py-2 rounded">Gửi</button>
      </form>
    </div>
  );
}
