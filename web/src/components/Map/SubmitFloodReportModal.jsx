import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import { X, Image as ImageIcon, Loader2, Trash2, MapPin } from "lucide-react";
import postsApi from "../../api/postsApi";
import {
  REPORT_TYPES,
  AREA_TYPES,
  LANDSLIDE_STATUS,
  FLOOD_LEVEL_TYPES,
  POINT_TYPES,
  RANGE_TYPES,
} from "../../utils/reportTypes";

const DANANG_CENTER = { lat: 16.0544, lng: 108.2022 };
const MAX_IMAGES = 5;
// Tên field phải khớp HONEYPOT_FIELD ở backend (src/api/controller/floodpost.controller.js)
const HONEYPOT_FIELD = "website";

function toDatetimeLocalValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const initialForm = () => ({
  address: "",
  fromAddress: "",
  toAddress: "",
  areaType: "Ngoài đường",
  floodLevel: "",
  landslideStatus: LANDSLIDE_STATUS[0],
  floodTime: toDatetimeLocalValue(new Date()),
  eventEndTime: "",
  description: "",
  isFrequentFlood: false,
});

function LocationPicker({ position, onPick }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return position ? <Marker position={[position.lat, position.lng]} /> : null;
}

export default function SubmitFloodReportModal({ open, onClose, onSubmitted }) {
  const { t } = useTranslation();
  const [reportType, setReportType] = useState("flood_point");
  const [form, setForm] = useState(initialForm);
  const [images, setImages] = useState([]);
  const [position, setPosition] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [honeypot, setHoneypot] = useState("");

  const isFloodLevelType = FLOOD_LEVEL_TYPES.includes(reportType);
  const isPointType = POINT_TYPES.includes(reportType);
  const isRangeType = RANGE_TYPES.includes(reportType);
  const isTree = reportType === "fallen_tree";
  const isLandslide = reportType === "landslide";

  const imagePreviews = useMemo(
    () => images.map((f) => ({ file: f, url: URL.createObjectURL(f) })),
    [images]
  );
  useEffect(() => {
    return () => imagePreviews.forEach((p) => URL.revokeObjectURL(p.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  // Reset toàn bộ form khi mở lại modal
  useEffect(() => {
    if (open) {
      setReportType("flood_point");
      setForm(initialForm());
      setImages([]);
      setPosition(null);
      setFieldErrors({});
      setSubmitError("");
      setSubmitted(false);
      setHoneypot("");
    }
  }, [open]);

  // Tự động lấy GPS khi mở modal hoặc chuyển sang tab cần ghim 1 điểm
  useEffect(() => {
    if (!open || !isPointType || position) return;
    if (!navigator.geolocation) {
      setPosition(DANANG_CENTER);
      setLocationError(t('submitReport.locationErrorUnsupported'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationError("");
        setLocating(false);
      },
      () => {
        setPosition(DANANG_CENTER);
        setLocationError(t('submitReport.locationErrorDenied'));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isPointType, reportType]);

  if (!open) return null;

  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
  };

  const onPickImages = (e) => {
    const files = Array.from(e.target.files || []);
    setImages((prev) => [...prev, ...files].slice(0, MAX_IMAGES));
    e.target.value = "";
  };

  const removeImage = (idx) => setImages((prev) => prev.filter((_, i) => i !== idx));

  const validate = () => {
    const errs = {};
    if (isPointType) {
      if (!form.address.trim()) errs.address = t('submitReport.addressRequired');
      if (!position) errs.location = t('submitReport.locationRequired');
    }
    if (isRangeType) {
      if (!form.fromAddress.trim()) errs.fromAddress = t('submitReport.fieldRequired');
      if (!form.toAddress.trim()) errs.toAddress = t('submitReport.fieldRequired');
    }
    if (isFloodLevelType) {
      if (!form.floodLevel || Number(form.floodLevel) < 0) errs.floodLevel = t('submitReport.floodLevelInvalid');
    }
    if (isLandslide && !form.eventEndTime) {
      errs.eventEndTime = t('submitReport.landslideEndRequired');
    }
    if (!form.floodTime) errs.floodTime = t('submitReport.timeRequired');
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    if (!validate()) return;

    const fd = new FormData();
    fd.append("reportType", reportType);
    fd.append("floodTime", new Date(form.floodTime).toISOString());
    fd.append(HONEYPOT_FIELD, honeypot); // rỗng với người dùng thật — bot tự động điền form mới set giá trị này

    if (isPointType) {
      fd.append(
        "location",
        JSON.stringify({
          province: "Đà Nẵng",
          district: "",
          address: form.address,
          latitude: position.lat,
          longitude: position.lng,
        })
      );
    } else {
      // Loại theo cặp địa chỉ vẫn cần location.province/district cho schema — không cần toạ độ
      fd.append("location", JSON.stringify({ province: "Đà Nẵng", district: "" }));
      fd.append("fromAddress", form.fromAddress);
      fd.append("toAddress", form.toAddress);
    }

    if (isFloodLevelType) {
      fd.append("floodLevel", form.floodLevel);
      fd.append("areaType", form.areaType);
      fd.append("isFrequentFlood", form.isFrequentFlood);
    }

    if (isLandslide) {
      fd.append("landslideStatus", form.landslideStatus);
      fd.append("eventEndTime", new Date(form.eventEndTime).toISOString());
      fd.append("isFrequentFlood", form.isFrequentFlood);
    }

    if (isTree) {
      fd.append("description", form.description);
    }

    images.forEach((f) => fd.append("images", f));

    setSubmitting(true);
    try {
      await postsApi.createPost(fd);
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      console.error(err);
      setSubmitError(
        err.response?.data?.error || t('submitReport.genericError')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const tabBtnClass = (value) =>
    `flex-1 min-w-[110px] px-3 py-2 rounded-xl text-sm font-bold transition-all ${
      reportType === value
        ? "bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-md shadow-blue-900/20"
        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
    }`;

  const inputClass = (err) =>
    `w-full border rounded-xl px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-400/20 ${
      err ? "border-red-400 focus:border-red-400" : "border-slate-200 focus:border-blue-400"
    }`;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-start md:items-center justify-center bg-black/50 backdrop-blur-sm p-3 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-xl rounded-2xl shadow-2xl my-6 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="text-lg font-black text-slate-800">{t('submitReport.title')}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl p-1.5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pt-4 flex flex-wrap gap-2">
          {REPORT_TYPES.map((rt) => (
            <button
              key={rt.value}
              type="button"
              className={tabBtnClass(rt.value)}
              onClick={() => setReportType(rt.value)}
            >
              {t(rt.i18nKey)}
            </button>
          ))}
        </div>

        {submitted ? (
          <div className="p-8 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl mb-3">
              ✓
            </div>
            <p className="font-bold text-slate-800">{t('submitReport.successTitle')}</p>
            <p className="text-sm text-slate-500 mt-1">
              {t('submitReport.successDetail')}
            </p>
            <button
              onClick={onClose}
              className="mt-5 bg-gradient-to-r from-blue-600 to-sky-500 text-white font-bold px-5 py-2 rounded-xl shadow-md shadow-blue-900/20"
            >
              {t('submitReport.close')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Honeypot — ẩn hoàn toàn khỏi người dùng thật, chỉ bot tự điền form mới chạm vào field này */}
            <input
              type="text"
              name={HONEYPOT_FIELD}
              tabIndex={-1}
              autoComplete="off"
              style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              aria-hidden="true"
            />

            {isPointType && (
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">
                  {isTree ? t('submitReport.addressTreeLabel') : t('submitReport.addressPointLabel')} <span className="text-red-500">*</span>
                </label>
                <input
                  className={inputClass(fieldErrors.address) + " mt-1"}
                  placeholder={isTree ? t('submitReport.addressTreeLabel') : t('submitReport.addressPointLabel')}
                  value={form.address}
                  onChange={(e) => setField("address", e.target.value)}
                />
                {fieldErrors.address && <p className="text-xs text-red-500 mt-1">{fieldErrors.address}</p>}

                <div className="mt-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase mb-1">
                    <MapPin size={12} /> {t('submitReport.pickLocation')}
                    {locating && <Loader2 size={12} className="animate-spin text-blue-500" />}
                  </div>
                  <div
                    className={`h-44 rounded-xl overflow-hidden border ${
                      fieldErrors.location ? "border-red-400" : "border-slate-200"
                    }`}
                  >
                    <MapContainer
                      center={[position?.lat ?? DANANG_CENTER.lat, position?.lng ?? DANANG_CENTER.lng]}
                      zoom={15}
                      style={{ height: "100%", width: "100%" }}
                    >
                      <TileLayer
                        attribution="&copy; OpenStreetMap"
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <LocationPicker position={position} onPick={(p) => { setPosition(p); setLocationError(""); setFieldErrors((e)=>({...e, location: undefined})); }} />
                    </MapContainer>
                  </div>
                  {(locationError || fieldErrors.location) && (
                    <p className="text-xs text-red-500 mt-1">{locationError || fieldErrors.location}</p>
                  )}
                </div>
              </div>
            )}

            {isRangeType && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase">
                    {isLandslide ? t('submitReport.fromLandslide') : t('submitReport.fromRoad')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    className={inputClass(fieldErrors.fromAddress) + " mt-1"}
                    placeholder={isLandslide ? t('submitReport.fromLandslide') : t('submitReport.fromRoad')}
                    value={form.fromAddress}
                    onChange={(e) => setField("fromAddress", e.target.value)}
                  />
                  {fieldErrors.fromAddress && <p className="text-xs text-red-500 mt-1">{fieldErrors.fromAddress}</p>}
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase">
                    {isLandslide ? t('submitReport.toLandslide') : t('submitReport.toRoad')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    className={inputClass(fieldErrors.toAddress) + " mt-1"}
                    placeholder={isLandslide ? t('submitReport.toLandslide') : t('submitReport.toRoad')}
                    value={form.toAddress}
                    onChange={(e) => setField("toAddress", e.target.value)}
                  />
                  {fieldErrors.toAddress && <p className="text-xs text-red-500 mt-1">{fieldErrors.toAddress}</p>}
                </div>
              </div>
            )}

            {isFloodLevelType && (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                <p className="text-xs font-bold text-slate-600 uppercase mb-2">{t('submitReport.floodLevelSection')}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500">{t('submitReport.chooseAreaType')}</label>
                    <select
                      className={inputClass(false) + " mt-1 bg-white"}
                      value={form.areaType}
                      onChange={(e) => setField("areaType", e.target.value)}
                    >
                      {AREA_TYPES.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500">{t('submitReport.floodLevelCm')}</label>
                    <input
                      type="number"
                      min="0"
                      className={inputClass(fieldErrors.floodLevel) + " mt-1 bg-white"}
                      value={form.floodLevel}
                      onChange={(e) => setField("floodLevel", e.target.value)}
                    />
                    {fieldErrors.floodLevel && <p className="text-xs text-red-500 mt-1">{fieldErrors.floodLevel}</p>}
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500">{t('submitReport.floodTimeLabel')}</label>
                    <input
                      type="datetime-local"
                      className={inputClass(fieldErrors.floodTime) + " mt-1 bg-white"}
                      value={form.floodTime}
                      onChange={(e) => setField("floodTime", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {isTree && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase">{t('submitReport.treeFallTimeLabel')}</label>
                  <input
                    type="datetime-local"
                    className={inputClass(fieldErrors.floodTime) + " mt-1"}
                    value={form.floodTime}
                    onChange={(e) => setField("floodTime", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase">{t('submitReport.impactDescription')}</label>
                  <textarea
                    rows={2}
                    className={inputClass(false) + " mt-1"}
                    placeholder={t('submitReport.impactPlaceholder')}
                    value={form.description}
                    onChange={(e) => setField("description", e.target.value)}
                  />
                </div>
              </div>
            )}

            {isLandslide && (
              <>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase">{t('submitReport.landslideTypeLabel')}</label>
                  <select
                    className={inputClass(false) + " mt-1"}
                    value={form.landslideStatus}
                    onChange={(e) => setField("landslideStatus", e.target.value)}
                  >
                    {LANDSLIDE_STATUS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">{t('submitReport.landslideStartLabel')}</label>
                    <input
                      type="datetime-local"
                      className={inputClass(fieldErrors.floodTime) + " mt-1"}
                      value={form.floodTime}
                      onChange={(e) => setField("floodTime", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">{t('submitReport.landslideEndLabel')}</label>
                    <input
                      type="datetime-local"
                      className={inputClass(fieldErrors.eventEndTime) + " mt-1"}
                      value={form.eventEndTime}
                      onChange={(e) => setField("eventEndTime", e.target.value)}
                    />
                    {fieldErrors.eventEndTime && <p className="text-xs text-red-500 mt-1">{fieldErrors.eventEndTime}</p>}
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">{t('submitReport.images')}</label>
              <div className="flex flex-wrap gap-2">
                {imagePreviews.map((p, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200">
                    <img src={p.url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute top-0.5 right-0.5 bg-black/60 hover:bg-red-600 text-white rounded-full p-0.5"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
                {images.length < MAX_IMAGES && (
                  <label className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 flex items-center justify-center cursor-pointer hover:border-blue-400 hover:text-blue-500 transition-colors">
                    <ImageIcon size={20} />
                    <input type="file" accept="image/png,image/jpeg" multiple hidden onChange={onPickImages} />
                  </label>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">{t('submitReport.maxImages', { count: MAX_IMAGES })}</p>
            </div>

            {(reportType === "flood_point" || reportType === "flood_road" || isLandslide) && (
              <label className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-xl p-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-amber-500"
                  checked={form.isFrequentFlood}
                  onChange={(e) => setField("isFrequentFlood", e.target.checked)}
                />
                <span className="text-xs text-amber-800">
                  <strong>{isLandslide ? t('submitReport.frequentLandslideLabel') : t('submitReport.frequentFloodLabel')}</strong> — {isLandslide ? t('submitReport.frequentLandslideDesc') : t('submitReport.frequentFloodDesc')}
                </span>
              </label>
            )}

            {submitError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-700 hover:to-sky-600 text-white font-bold py-2.5 rounded-xl shadow-md shadow-blue-900/20 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {submitting ? t('submitReport.submitting') : t('submitReport.submitBtn')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
