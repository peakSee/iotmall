function safeText(value, fallbackValue = '') {
    return String(value ?? fallbackValue).trim();
}

function cloneMeta(value) {
    return value && typeof value === 'object' ? { ...value } : null;
}

function buildLatestTrackSignature(order = {}) {
    const ems = order?.ems || {};
    const items = Array.isArray(ems.track_items) ? [...ems.track_items] : [];
    const latestItem = items.sort((left, right) => String(right.op_time || '').localeCompare(String(left.op_time || '')))[0] || null;

    if (latestItem) {
        return [latestItem.op_time, latestItem.op_code, latestItem.op_desc, latestItem.op_name].filter(Boolean).join('|');
    }

    return safeText(ems.track_summary);
}

function normalizeUserNotice(rawNotice = {}) {
    const createdAt = rawNotice.created_at || rawNotice.createdAt || new Date().toISOString();
    return {
        id: safeText(rawNotice.id, `notice-${Date.now()}-${Math.floor(Math.random() * 100000)}`),
        notice_key: safeText(rawNotice.notice_key ?? rawNotice.noticeKey),
        type: safeText(rawNotice.type, 'info'),
        level: safeText(rawNotice.level, 'info'),
        title: safeText(rawNotice.title),
        message: safeText(rawNotice.message),
        created_at: createdAt,
        read_at: rawNotice.read_at || rawNotice.readAt || null,
        meta: cloneMeta(rawNotice.meta),
    };
}

function normalizeUserNoticeCenter(rawCenter = {}) {
    const source = rawCenter && typeof rawCenter === 'object' ? rawCenter : {};
    const notices = Array.isArray(source.notices)
        ? source.notices
              .map(normalizeUserNotice)
              .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())
        : [];

    return {
        last_read_at: source.last_read_at || source.lastReadAt || null,
        notices,
    };
}

function buildOrderNoticeSnapshot(order = {}) {
    return {
        tracking_number: safeText(order?.ems?.waybill_no || order?.merchant_tracking_number),
        printed_at: order?.ems?.printed_at || null,
        print_message: safeText(order?.ems?.print_message),
        track_summary: safeText(order?.ems?.track_summary),
        last_track_sync_at: order?.ems?.last_track_sync_at || null,
        latest_track_signature: buildLatestTrackSignature(order),
    };
}

function countUnreadOrderNotices(order = {}) {
    const center = normalizeUserNoticeCenter(order.user_notice_center);
    return center.notices.filter((notice) => !notice.read_at).length;
}

function appendOrderUserNotice(order, notice = {}, { markAsRead = false } = {}) {
    const center = normalizeUserNoticeCenter(order.user_notice_center);
    const createdAt = notice.created_at || notice.createdAt || new Date().toISOString();
    const noticeKey = safeText(notice.notice_key ?? notice.noticeKey, `${safeText(notice.type, 'notice')}:${createdAt}`);

    if (center.notices.some((item) => safeText(item.notice_key) === noticeKey)) {
        order.user_notice_center = center;
        return null;
    }

    const entry = normalizeUserNotice({
        ...notice,
        notice_key: noticeKey,
        created_at: createdAt,
        read_at: markAsRead ? createdAt : notice.read_at || notice.readAt || null,
    });

    center.notices = [entry, ...center.notices]
        .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())
        .slice(0, 60);

    if (markAsRead) {
        center.last_read_at = createdAt;
    }

    order.user_notice_center = center;
    return entry;
}

function syncOrderLogisticsUserNotices(order, { previousSnapshot = null, markAsRead = false } = {}) {
    const previous = previousSnapshot && typeof previousSnapshot === 'object' ? previousSnapshot : {};
    const current = buildOrderNoticeSnapshot(order);
    const createdNotices = [];

    if (current.tracking_number && current.tracking_number !== safeText(previous.tracking_number)) {
        const created = appendOrderUserNotice(
            order,
            {
                type: 'waybill_created',
                level: 'info',
                notice_key: `waybill:${current.tracking_number}`,
                title: 'EMS 单号已生成',
                message: `当前单号：${current.tracking_number}，商家已完成建单。`,
                created_at: order?.ems?.waybill_created_at || new Date().toISOString(),
                meta: {
                    tracking_number: current.tracking_number,
                },
            },
            { markAsRead },
        );
        if (created) {
            createdNotices.push(created);
        }
    }

    if (current.printed_at && current.printed_at !== previous.printed_at) {
        const created = appendOrderUserNotice(
            order,
            {
                type: 'print_completed',
                level: 'success',
                notice_key: `print:${safeText(current.printed_at)}`,
                title: '面单已打印完成',
                message: safeText(order?.ems?.print_message, '商家已完成面单打印，正在等待揽收或进入运输节点。'),
                created_at: current.printed_at,
                meta: {
                    tracking_number: current.tracking_number,
                },
            },
            { markAsRead },
        );
        if (created) {
            createdNotices.push(created);
        }
    }

    if (
        current.last_track_sync_at &&
        current.latest_track_signature &&
        current.latest_track_signature !== safeText(previous.latest_track_signature)
    ) {
        const created = appendOrderUserNotice(
            order,
            {
                type: 'track_updated',
                level: 'accent',
                notice_key: `track:${current.latest_track_signature}`,
                title: '物流轨迹已更新',
                message: safeText(order?.ems?.track_summary, 'EMS 物流轨迹已更新。'),
                created_at: current.last_track_sync_at,
                meta: {
                    tracking_number: current.tracking_number,
                    track_summary: current.track_summary,
                },
            },
            { markAsRead },
        );
        if (created) {
            createdNotices.push(created);
        }
    }

    order.user_notice_center = normalizeUserNoticeCenter(order.user_notice_center);
    return {
        currentSnapshot: current,
        createdNotices,
        unreadCount: countUnreadOrderNotices(order),
    };
}

function markOrderNoticesRead(order, { noticeIds = [], readAll = false, readAt = new Date().toISOString() } = {}) {
    const center = normalizeUserNoticeCenter(order.user_notice_center);
    const noticeIdSet = new Set((Array.isArray(noticeIds) ? noticeIds : []).map((item) => safeText(item)).filter(Boolean));
    let changed = false;

    center.notices = center.notices.map((notice) => {
        if (notice.read_at) {
            return notice;
        }

        if (!readAll && noticeIdSet.size && !noticeIdSet.has(safeText(notice.id))) {
            return notice;
        }

        changed = true;
        return {
            ...notice,
            read_at: readAt,
        };
    });

    if (changed) {
        center.last_read_at = readAt;
    }

    order.user_notice_center = center;
    return {
        changed,
        center,
        unreadCount: countUnreadOrderNotices(order),
    };
}

module.exports = {
    appendOrderUserNotice,
    buildLatestTrackSignature,
    buildOrderNoticeSnapshot,
    countUnreadOrderNotices,
    markOrderNoticesRead,
    normalizeUserNoticeCenter,
    syncOrderLogisticsUserNotices,
};
