import React, { useEffect, useState } from "react";
import axiosClient from "../../api/axiosClient";

export default function MyReports(){
  const [reports,setReports]=useState([]);
  useEffect(()=> {
    (async()=> {
      try {
        const r = await axiosClient.get("/posts"); // If you add /posts/me on backend, change this.
        setReports(r.data || []);
      } catch (err){ console.error(err); }
    })();
  }, []);
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Danh sách phản ánh của tôi</h2>
      <div className="space-y-3">
        {reports.map(r => (
          <div key={r._id} className="bg-white p-3 rounded shadow">
            <div className="font-semibold">{r.location?.district || r.location?.province}</div>
            <div className="text-sm text-gray-600">{r.description}</div>
            <div className="text-xs mt-2">Trạng thái: <span className={r.status==="approved"?"text-green-600": r.status==="pending"?"text-yellow-600":"text-red-600"}>{r.status}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}
