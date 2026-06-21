const zoneTravelTime = {
  north: {
    north: 16,
    central: 30,
    east: 38,
    eastCore: 44,
    southwest: 52,
    default: 34
  },
  east: {
    north: 38,
    central: 28,
    east: 16,
    eastCore: 22,
    southwest: 48,
    default: 32
  },
  southwest: {
    north: 54,
    central: 34,
    east: 50,
    eastCore: 46,
    southwest: 16,
    default: 36
  },
  eastCore: {
    north: 44,
    central: 30,
    east: 22,
    eastCore: 14,
    southwest: 46,
    default: 32
  },
  central: {
    north: 30,
    central: 18,
    east: 28,
    eastCore: 30,
    southwest: 34,
    default: 26
  },
  default: {
    north: 34,
    central: 26,
    east: 32,
    eastCore: 32,
    southwest: 36,
    default: 30
  }
};

export function recommendPlaces(participants, candidatePlaces, destinationType, minRating = 4) {
  if (!Array.isArray(participants) || participants.length === 0) {
    return [];
  }

  const strictCandidates = candidatePlaces.filter(
    (place) => place.type === destinationType && place.rating >= minRating
  );
  const relaxedRatingCandidates = candidatePlaces.filter((place) => place.type === destinationType);
  const candidates = strictCandidates.length > 0 ? strictCandidates : relaxedRatingCandidates;

  return candidates
    .map((place) => {
      const timesByParticipant = {};
      const zonesByParticipant = {};
      const times = participants.map((participant, index) => {
        const precomputedTime = place.timesByParticipant?.[participant.id];
        const time = Number.isFinite(precomputedTime)
          ? precomputedTime
          : getMockTime({ participant, place, index });

        timesByParticipant[participant.id] = time;
        zonesByParticipant[participant.id] = getParticipantZone(participant.origin || '');
        return time;
      });

      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);
      const timeGap = maxTime - minTime;
      const fairnessScore = Math.max(0, 100 - timeGap * 2);
      const convenienceScore = Math.max(0, 100 - avgTime * 1.5);
      const ratingScore = (place.rating / 5) * 100;
      const totalScore = convenienceScore * 0.4 + fairnessScore * 0.45 + ratingScore * 0.15;

      return {
        ...place,
        timesByParticipant,
        zonesByParticipant,
        avgTime,
        maxTime,
        minTime,
        timeGap,
        fairnessScore,
        convenienceScore,
        ratingScore,
        totalScore,
        fairnessLabel: getFairnessLabel(timeGap),
        recommendationReason: getRecommendationReason(timeGap)
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore);
}

export function getParticipantZone(origin) {
  if (/五道口|中关村|海淀/.test(origin)) {
    return 'north';
  }
  if (/陆家嘴|世纪大道/.test(origin)) {
    return 'eastCore';
  }
  if (/国贸|朝阳|三里屯/.test(origin)) {
    return 'east';
  }
  if (/徐汇|淮海中路|上海南站/.test(origin)) {
    return 'southwest';
  }
  return 'default';
}

export function getRecommendationReason(timeGap) {
  if (timeGap <= 10) {
    return '双方通勤耗时差较小，整体抵达更均衡。';
  }
  if (timeGap <= 20) {
    return '整体通勤仍较均衡，适合作为折中约会地点。';
  }
  if (timeGap <= 35) {
    return '存在一定通勤差距，建议结合地点偏好再决定。';
  }
  return '通勤差距较大，可能会让部分参与者承担更多路程。';
}

function getMockTime({ participant, place, index }) {
  const origin = participant.origin?.trim() || '';
  const participantZone = getParticipantZone(origin);
  const placeZone = place.locationZone || 'default';
  const baseTime = zoneTravelTime[participantZone]?.[placeZone] ?? zoneTravelTime.default.default;
  return Math.max(8, baseTime + getStableTimeOffset(place.id, origin, index));
}

function getFairnessLabel(timeGap) {
  if (timeGap <= 10) {
    return '非常公平';
  }
  if (timeGap <= 20) {
    return '较公平';
  }
  if (timeGap <= 35) {
    return '一般';
  }
  return '不推荐';
}

function getStableTimeOffset(placeId, origin, participantIndex) {
  const source = `${placeId}-${origin}-${participantIndex}`;
  let total = 0;
  for (let index = 0; index < source.length; index += 1) {
    total += source.charCodeAt(index);
  }
  return (total % 9) - 4;
}
