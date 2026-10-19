import NavbarPublic from '../../components/NavbarPublic';
import DigitalTwinMap from './DigitalTwinMap.jsx';

/** Trang /ban-do-so: bản đồ số 3D lưu vực Vu Gia – Thu Bồn, cùng khung với trang bản đồ 2D. */
export default function DigitalTwinPage() {
  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-900 font-sans">
      <NavbarPublic />
      <div className="absolute top-16 left-0 w-full h-[calc(100vh-4rem)] z-0">
        <DigitalTwinMap />
      </div>
    </div>
  );
}
