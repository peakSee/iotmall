const express = require('express');
const { readDevices, readPlans, readSettings } = require('../utils/store');

const router = express.Router();

function asyncHandler(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

router.get(
    '/',
    asyncHandler(async (req, res) => {
        const plans = (await readPlans())
            .filter((item) => item.status === 'active')
            .sort(
                (a, b) => b.hot_rank - a.hot_rank || Number(b.featured) - Number(a.featured) || a.sort_order - b.sort_order || b.id - a.id,
            );

        const devices = (await readDevices())
            .filter((item) => item.status === 'active')
            .sort(
                (a, b) =>
                    Number(b.stock > 0) - Number(a.stock > 0) ||
                    b.hot_rank - a.hot_rank ||
                    Number(b.featured) - Number(a.featured) ||
                    a.sort_order - b.sort_order ||
                    b.id - a.id,
            );

        const settings = await readSettings();

        res.json({
            settings,
            plans,
            devices,
            stats: {
                plan_count: plans.length,
                featured_plan_count: plans.filter((item) => item.featured).length,
                device_count: devices.length,
                featured_device_count: devices.filter((item) => item.featured).length,
            },
        });
    }),
);

module.exports = router;
