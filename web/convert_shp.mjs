import { open } from 'shapefile';
import { writeFileSync } from 'fs';

const shpPath = 'd:/VoNguyenAn/Demo Code VS/BackEnd_NCKH/Vietnam_Include_Islands/Vietnam/border.shp';
const outPath = 'd:/VoNguyenAn/Demo Code VS/BackEnd_NCKH/web/src/utils/vietnamBoundary.json';

async function convert() {
    const features = [];
    const source = await open(shpPath);
    let result = await source.read();
    while (!result.done) {
        features.push(result.value);
        result = await source.read();
    }
    const geojson = { type: 'FeatureCollection', features };
    writeFileSync(outPath, JSON.stringify(geojson));
    console.log(`Done: ${features.length} features written`);
}

convert().catch(console.error);
