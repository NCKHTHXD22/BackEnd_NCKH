import InflowLake from '../../core/entities/InflowLake.js';

class InflowLakeRepository {
    findAll() {
        return InflowLake.find().sort({ Id_Lake: 1 });
    }

    findByLakeId(Id_Lake) {
        return InflowLake.findOne({ Id_Lake });
    }

    // update cả sumDepth + level
    updateFromHistory(Id_Lake, sumDepth, level, timestamp) {
        return InflowLake.findOneAndUpdate(
            { Id_Lake },
            {
                sumDepth,
                level,
                lastUpdate: timestamp
            },
            { new: true }
        );
    }

    // update hydro data (inflow, outflow, waterlevel)
    updateHydroData(Id_Lake, qvao, luuluongxa, htl, timestamp) {
        return InflowLake.findOneAndUpdate(
            { Id_Lake },
            {
                qvao,
                luuluongxa,
                htl,
                lastUpdate: timestamp || new Date()
            },
            { new: true }
        );
    }
}

export default new InflowLakeRepository();
