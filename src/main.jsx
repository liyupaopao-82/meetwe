import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import RealMapPanel from './components/RealMapPanel';
import { candidatePlaces } from './data/mockPlaces';
import { buildAmapRecommendations } from './services/amapApi';
import { getRecommendationReason, recommendPlaces } from './utils/recommend';
import './styles.css';

const PLAN_STORAGE_KEY = 'meetwe-plan-v1';
const destinationTypes = [
  { label: '美食', icon: '食' },
  { label: '商场购物', icon: '购' },
  { label: '电影', icon: '影' },
  { label: '休闲玩乐', icon: '玩' },
  { label: '景点', icon: '景' }
];
const transportModes = ['步行', '驾车', '公共交通', '骑行', '打车'];

const initialParticipants = [
  { id: crypto.randomUUID(), name: '小林', origin: '上海海事大学（临港校区）', transport: '公共交通' },
  { id: crypto.randomUUID(), name: '阿周', origin: '世纪公园', transport: '公共交通' }
];

function App() {
  const [page, setPage] = useState('home');
  const [city, setCity] = useState('上海');
  const [destinationType, setDestinationType] = useState('美食');
  const [participants, setParticipants] = useState(initialParticipants);
  const [minRating, setMinRating] = useState(4);
  const [plannedPlaces, setPlannedPlaces] = useState(loadStoredPlan);
  const [planToast, setPlanToast] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [realRecommendations, setRealRecommendations] = useState(null);
  const [mapContext, setMapContext] = useState(null);
  const [serviceNotice, setServiceNotice] = useState('');

  const mockRecommendations = useMemo(
    () => recommendPlaces(participants, candidatePlaces, destinationType, minRating),
    [participants, destinationType, minRating]
  );
  const recommendations = realRecommendations || mockRecommendations;

  useEffect(() => {
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plannedPlaces));
  }, [plannedPlaces]);

  const generateRecommendations = async (nextDestinationType = destinationType) => {
    setDestinationType(nextDestinationType);
    setPage('results');
    setIsGenerating(true);
    setRealRecommendations(null);
    setMapContext(null);
    setServiceNotice('');

    try {
      const result = await withTimeout(
        buildAmapRecommendations({
          participants,
          category: nextDestinationType,
          city,
          minRating
        }),
        25000
      );
      setRealRecommendations(result.recommendations);
      setMapContext(result.mapContext);
      setServiceNotice('已使用高德地图计算真实公共交通耗时。');
    } catch (error) {
      console.warn('Amap recommendation fallback:', error);
      setServiceNotice('地图服务暂时不可用，已为你展示模拟推荐结果。当前使用模拟数据展示，配置地图服务后可计算真实通勤时间。');
    } finally {
      setIsGenerating(false);
    }
  };

  const addToPlan = (place) => {
    const alreadyAdded = plannedPlaces.some((item) => item.id === place.id);
    const placeForPlan = {
      ...place,
      savedParticipantTimes: participants.map((person) => ({
        id: person.id,
        name: person.name || '未命名',
        time: place.timesByParticipant?.[person.id] ?? '-'
      }))
    };

    setPlannedPlaces((current) => {
      if (current.some((item) => item.id === place.id)) {
        return current;
      }
      return [...current, placeForPlan];
    });

    setPlanToast(alreadyAdded ? '这个地点已经在计划清单里了' : '已加入计划清单');
    window.setTimeout(() => setPlanToast(''), 1800);
  };

  const removeFromPlan = (placeId) => {
    setPlannedPlaces((current) => current.filter((place) => place.id !== placeId));
  };

  return (
    <main className="app-shell">
      <div className="phone-frame">
        {page === 'home' && <HomePage onStart={() => setPage('setup')} />}
        {page === 'setup' && (
          <SetupPage
            city={city}
            setCity={setCity}
            destinationType={destinationType}
            setDestinationType={setDestinationType}
            participants={participants}
            setParticipants={setParticipants}
            onGenerate={generateRecommendations}
            onBack={() => setPage('home')}
          />
        )}
        {page === 'results' && (
          <ResultsPage
            city={city}
            destinationType={destinationType}
            setDestinationType={setDestinationType}
            minRating={minRating}
            setMinRating={setMinRating}
            participants={participants}
            recommendations={recommendations}
            plannedPlaces={plannedPlaces}
            planToast={planToast}
            isGenerating={isGenerating}
            mapContext={mapContext}
            serviceNotice={serviceNotice}
            onRefreshCategory={generateRecommendations}
            onAddToPlan={addToPlan}
            onBack={() => setPage('setup')}
            onOpenPlan={() => setPage('plan')}
          />
        )}
        {page === 'plan' && (
          <PlanPage
            plannedPlaces={plannedPlaces}
            participants={participants}
            onBack={() => setPage('results')}
            onRemove={removeFromPlan}
          />
        )}
      </div>
    </main>
  );
}

function HomePage({ onStart }) {
  return (
    <section className="page home-page">
      <div className="logo-mark" aria-label="MeetWe Logo">
        <div className="logo-bubbles" aria-hidden="true">
          <span className="bubble blue" />
          <span className="bubble pink" />
          <span className="bubble purple" />
        </div>
        <span className="logo-text">MW</span>
      </div>
      <div className="home-copy">
        <h1>MeetWe</h1>
        <p>告别单向奔波，让每一次约会都轻松抵达</p>
      </div>
      <button className="primary-button" type="button" onClick={onStart}>
        开始创建聚会
      </button>
      <ul className="home-notes" aria-label="产品能力">
        <li>根据出发地估算通勤耗时</li>
        <li>优先寻找更公平的约会地点</li>
        <li>保存多个候选计划</li>
      </ul>
    </section>
  );
}

function SetupPage({
  city,
  setCity,
  destinationType,
  setDestinationType,
  participants,
  setParticipants,
  onGenerate,
  onBack
}) {
  const [formError, setFormError] = useState('');
  const [editingParticipantId, setEditingParticipantId] = useState(null);
  const reachedLimit = participants.length >= 6;
  const editingParticipant = participants.find((person) => person.id === editingParticipantId);

  const addParticipant = () => {
    if (reachedLimit) return;

    const newParticipant = {
      id: crypto.randomUUID(),
      name: `参与者 ${participants.length + 1}`,
      origin: '',
      transport: '公共交通'
    };

    setParticipants((current) => [...current, newParticipant]);
    setEditingParticipantId(newParticipant.id);
    setFormError('');
  };

  const updateParticipant = (id, field, value) => {
    setParticipants((current) =>
      current.map((participant) =>
        participant.id === id ? { ...participant, [field]: value } : participant
      )
    );
    setFormError('');
  };

  const deleteParticipant = (id) => {
    setParticipants((current) => current.filter((participant) => participant.id !== id));
    if (editingParticipantId === id) {
      setEditingParticipantId(null);
    }
  };

  const validateAndGenerate = () => {
    if (participants.length < 2) {
      setFormError('请至少添加 2 位参与者');
      return;
    }

    if (!city.trim()) {
      setFormError('请填写城市');
      return;
    }

    const hasEmptyField = participants.some(
      (person) => !person.name.trim() || !person.origin.trim()
    );

    if (hasEmptyField) {
      setFormError('请填写所有参与者的昵称和出发地');
      return;
    }

    setFormError('');
    onGenerate();
  };

  if (editingParticipant) {
    return (
      <ParticipantEditPage
        participant={editingParticipant}
        onBack={() => setEditingParticipantId(null)}
        onChange={updateParticipant}
        onDone={() => setEditingParticipantId(null)}
      />
    );
  }

  return (
    <section className="page setup-page reference-setup-page">
      <header className="setup-topbar">
        <button className="setup-back-link" type="button" onClick={onBack} aria-label="返回首页">
          <span aria-hidden="true">‹</span>
        </button>
        <h1>聚会设置</h1>
      </header>

      <section className="setup-block">
        <h2>去哪</h2>
        <div className="destination-cloud">
          {destinationTypes.map((type) => (
            <button
              className={`reference-chip ${destinationType === type.label ? 'active' : ''}`}
              type="button"
              key={type.label}
              onClick={() => setDestinationType(type.label)}
            >
              <span>{type.icon}</span>
              {type.label}
            </button>
          ))}
        </div>
      </section>

      <section className="setup-block city-block">
        <h2>城市</h2>
        <input
          className="city-input"
          value={city}
          placeholder="例如：上海"
          onChange={(event) => setCity(event.target.value)}
        />
      </section>

      <section className="setup-block participants-block">
        <h2>谁去</h2>
        <p>最多可添加6人</p>

        <div className="reference-participant-list">
          {participants.map((participant, index) => (
            <article className="reference-participant-card" key={participant.id}>
              <div className="participant-index">{index + 1}</div>
              <div className="participant-divider" />
              <div className="participant-summary">
                <strong>
                  {participant.name || `参与者 ${index + 1}`}
                  <span className="transport-badge">{getTransportShortName(participant.transport)}</span>
                </strong>
                <span>
                  <i aria-hidden="true" />
                  {participant.origin || '待填写出发地'}
                </span>
              </div>
              <div className="participant-actions">
                <button type="button" className="outline-pill" onClick={() => setEditingParticipantId(participant.id)}>
                  编辑
                </button>
                <button
                  type="button"
                  className="ghost-pill"
                  onClick={() => deleteParticipant(participant.id)}
                  disabled={participants.length === 1}
                >
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>

        {reachedLimit ? (
          <p className="limit-tip reference-limit">最多可添加 6 人</p>
        ) : (
          <button className="add-pill-button" type="button" onClick={addParticipant}>
            添加
          </button>
        )}
      </section>

      {formError && <p className="form-error">{formError}</p>}

      <div className="setup-bottom-action">
        <button className="primary-button generate-pill" type="button" onClick={validateAndGenerate}>
          生成推荐地
        </button>
      </div>
    </section>
  );
}

function ParticipantEditPage({ participant, onBack, onChange, onDone }) {
  return (
    <section className="page participant-edit-page">
      <Header title="编辑参与者" onBack={onBack} />

      <section className="panel edit-form-panel">
        <label>
          昵称
          <input
            type="text"
            placeholder="例如：小林"
            value={participant.name}
            onChange={(event) => onChange(participant.id, 'name', event.target.value)}
          />
        </label>
        <label>
          出发地
          <input
            type="text"
            placeholder="例如：上海海事大学（临港校区） / 世纪公园 / 陆家嘴"
            value={participant.origin}
            onChange={(event) => onChange(participant.id, 'origin', event.target.value)}
          />
        </label>
        <label>
          交通方式
          <select
            value={participant.transport}
            onChange={(event) => onChange(participant.id, 'transport', event.target.value)}
          >
            {transportModes.map((mode) => (
              <option key={mode}>{mode}</option>
            ))}
          </select>
        </label>
      </section>

      <div className="sticky-action">
        <button className="primary-button" type="button" onClick={onDone}>
          保存
        </button>
      </div>
    </section>
  );
}

function ResultsPage({
  city,
  destinationType,
  setDestinationType,
  minRating,
  setMinRating,
  participants,
  recommendations,
  plannedPlaces,
  planToast,
  isGenerating,
  mapContext,
  serviceNotice,
  onRefreshCategory,
  onAddToPlan,
  onBack,
  onOpenPlan
}) {
  const [isMapFullScreen, setIsMapFullScreen] = useState(false);
  const [mapLoadState, setMapLoadState] = useState('idle');
  const plannedIds = new Set(plannedPlaces.map((place) => place.id));
  const mapParticipants = mapContext?.participants || participants;
  const mapCenter = mapContext?.center || null;
  const fallbackMap = <MapMock participants={participants} recommendations={recommendations} />;
  const fullscreenFallbackMap = (
    <MapMock participants={participants} recommendations={recommendations} variant="fullscreen" />
  );
  const fallbackNotice =
    '当前使用模拟数据展示，配置地图服务后可计算真实通勤时间。';
  const visibleServiceNotice =
    serviceNotice || (!isGenerating && !mapContext ? fallbackNotice : '');
  const mapStatusText = getMapStatusText({ mapContext, mapLoadState });

  useEffect(() => {
    setMapLoadState(mapContext ? 'loading' : 'mock');
  }, [mapContext]);

  return (
    <section className="page results-page reference-results-page">
      <header className="results-topbar">
        <button className="results-back-link" type="button" onClick={onBack} aria-label="返回">
          <span aria-hidden="true">‹</span>
        </button>
        <h1>推荐结果</h1>
        <div className="results-actions">
          <button className="plan-star-button" type="button" onClick={onOpenPlan} aria-label="计划清单">
            <span aria-hidden="true">★</span>
            <em>{plannedPlaces.length}</em>
          </button>
          <button className="menu-button" type="button" onClick={onOpenPlan} aria-label="打开计划清单">
            ☰
          </button>
        </div>
      </header>

      {isGenerating && <div className="loading-tip">正在计算更公平的约会地点...</div>}
      {planToast && <div className="toast-tip">{planToast}</div>}
      {visibleServiceNotice && (
        <div className={`service-notice ${mapContext ? 'success' : ''}`}>
          {visibleServiceNotice}
        </div>
      )}

      <section className="results-filter-panel">
        <div className="filter-row" aria-label="目的地类型筛选">
          {destinationTypes.map((type) => (
            <button
              className={`mini-chip ${destinationType === type.label ? 'active' : ''}`}
              type="button"
              key={type.label}
              onClick={() => onRefreshCategory(type.label)}
              disabled={isGenerating || destinationType === type.label}
            >
              <span>{type.icon}</span>
              {type.label}
            </button>
          ))}
        </div>
        <div className="rating-filter-row">
          <span>评分筛选</span>
          <strong>{Number(minRating).toFixed(1)} 分以上</strong>
        </div>
        <input
          className="rating-range"
          type="range"
          min="3.5"
          max="5"
          step="0.1"
          value={minRating}
          onChange={(event) => setMinRating(Number(event.target.value))}
          aria-label="最低评分"
          disabled={isGenerating}
        />
      </section>

      <p className="explain-copy">
        已根据所有参与者出发地，优先推荐平均耗时较短、通勤差距较小的地点。当前城市：{city}
      </p>

      <section className="results-map-card">
        <div className="map-card-header">
          <strong>地图</strong>
          <button type="button" aria-label="收起地图">⌃</button>
        </div>
        {mapStatusText && <p className={`map-status ${mapLoadState}`}>{mapStatusText}</p>}
        <div className="map-card-body">
          {mapContext ? (
            <RealMapPanel
              participants={mapParticipants}
              center={mapCenter}
              recommendations={recommendations}
              fallback={fallbackMap}
              className="card-real-map"
              onLoadStatus={setMapLoadState}
            />
          ) : (
            fallbackMap
          )}
          <button
            className="fullscreen-button"
            type="button"
            onClick={() => setIsMapFullScreen(true)}
          >
            全屏
          </button>
        </div>
      </section>

      {isMapFullScreen && (
        <section className="map-fullscreen-layer" aria-label="完整地图">
          <header className="map-fullscreen-header">
            <button type="button" onClick={() => setIsMapFullScreen(false)} aria-label="关闭完整地图">
              ‹
            </button>
            <h2>地图</h2>
            <span>{mapContext ? '高德地图' : '模拟地图'}</span>
          </header>
          <div className="map-fullscreen-body">
            {mapContext ? (
              <RealMapPanel
                participants={mapParticipants}
                center={mapCenter}
                recommendations={recommendations}
                fallback={fullscreenFallbackMap}
                className="fullscreen-real-map"
                onLoadStatus={setMapLoadState}
              />
            ) : (
              fullscreenFallbackMap
            )}
          </div>
        </section>
      )}

      <div className="card-list">
        {recommendations.length === 0 ? (
          <EmptyState text="暂时没有符合条件的地点，试试降低评分或切换类型。" />
        ) : (
          recommendations.map((place) => {
            const added = plannedIds.has(place.id);
            return (
              <PlaceCard
                key={place.id}
                place={place}
                participants={participants}
                actionLabel={added ? '已加入' : '加入计划'}
                actionDisabled={added || isGenerating}
                onAction={() => onAddToPlan(place)}
              />
            );
          })
        )}
      </div>
    </section>
  );
}

function PlanPage({ plannedPlaces, participants, onBack, onRemove }) {
  return (
    <section className="page plan-page reference-plan-page">
      <header className="plan-topbar">
        <button className="plan-back-link" type="button" onClick={onBack} aria-label="返回">
          <span aria-hidden="true">‹</span>
        </button>
        <h1>计划清单</h1>
      </header>

      <div className="plan-card-list">
        {plannedPlaces.length === 0 ? (
          <EmptyState
            text="还没有加入候选地点，先去推荐结果里挑一个吧。"
            actionLabel="返回推荐结果"
            onAction={onBack}
          />
        ) : (
          plannedPlaces.map((place) => (
            <PlanPlaceCard
              key={place.id}
              place={place}
              participants={participants}
              onRemove={() => onRemove(place.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function PlanPlaceCard({ place, participants, onRemove }) {
  const timeItems =
    place.savedParticipantTimes?.length > 0
      ? place.savedParticipantTimes
      : participants.map((person) => ({
          id: person.id,
          name: person.name || '未命名',
          time: place.timesByParticipant?.[person.id] ?? '-'
        }));

  const numericTimes = timeItems
    .map((item) => Number(item.time))
    .filter((time) => Number.isFinite(time));
  const maxTime = numericTimes.length > 0 ? Math.max(...numericTimes) : 1;

  return (
    <article className="plan-place-card">
      <div className="plan-place-head">
        <h3>{place.name}</h3>
        <button className="pin-remove-button" type="button" onClick={onRemove} aria-label="从计划清单删除">
          <span aria-hidden="true">⌖</span>
        </button>
      </div>

      <div className="plan-place-badges">
        <span className="rating-badge">评分 {place.rating.toFixed(1)}</span>
        <span className="time-badge">平均耗时 {Math.round(place.avgTime)} min</span>
      </div>

      <div className="plan-time-bars">
        {timeItems.map((item) => {
          const time = Number(item.time);
          const width = Number.isFinite(time) ? Math.max(24, Math.min(100, (time / maxTime) * 100)) : 24;

          return (
            <div className="plan-time-row" key={item.id || item.name}>
              <div className="plan-time-line">
                <span>{item.name || '未命名'}</span>
                <strong>{Number.isFinite(time) ? `${Math.round(time)} min` : '暂不可达'}</strong>
              </div>
              <div className="time-bar-track">
                <i style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function Header({ title, onBack, actions = [] }) {
  return (
    <header className="page-header">
      <div className="header-left">
        {onBack && (
          <button className="back-button" type="button" onClick={onBack} aria-label="返回">
            <span aria-hidden="true">‹</span>
          </button>
        )}
        <h2>{title}</h2>
      </div>
      {actions.length > 0 && (
        <div className="header-actions">
          {actions.map((action) => (
            <button className="text-button" type="button" onClick={action.onClick} key={action.label}>
              {action.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}

function MapMock({ participants, recommendations, variant = 'card' }) {
  const visiblePlaces = recommendations.slice(0, 3);

  return (
    <section className={`map-mock ${variant === 'fullscreen' ? 'map-mock-fullscreen' : ''}`} aria-label="地图占位区域">
      <div className="map-grid" />
      <div className="map-route route-a" />
      <div className="map-route route-b" />
      <div className="map-center">约会中心</div>
      {participants.slice(0, 6).map((person, index) => (
        <span className={`map-label person pin-${index + 1}`} key={person.id}>
          {person.name || `参与者${index + 1}`}
        </span>
      ))}
      {visiblePlaces.map((place, index) => (
        <span className={`map-label place place-${index + 1}`} key={place.id}>
          推荐地点 {index + 1}
        </span>
      ))}
    </section>
  );
}

function PlaceCard({
  place,
  participants,
  actionLabel,
  actionDisabled = false,
  actionVariant = 'primary',
  onAction
}) {
  const [showWhy, setShowWhy] = useState(false);
  const timeItems =
    place.savedParticipantTimes?.length > 0
      ? place.savedParticipantTimes
      : participants.map((person) => ({
          id: person.id,
          name: person.name || '未命名',
          time: place.timesByParticipant?.[person.id] ?? '-'
        }));

  return (
    <article className="place-card">
      <div className="place-topline">
        <div>
          <h3>{place.name}</h3>
          <p>{place.area || place.address} · {place.type}</p>
        </div>
        <span className={`fairness-tag ${getFairnessClass(place.fairnessLabel)}`}>
          {place.fairnessLabel}
        </span>
      </div>

      <div className="metric-row">
        <Metric label="评分" value={place.rating.toFixed(1)} />
        <Metric label="平均耗时" value={`${Math.round(place.avgTime)} 分钟`} />
        <Metric label="推荐分" value={Math.round(place.totalScore)} />
      </div>

      <p className="reason-copy">{place.recommendationReason || getRecommendationReason(place.timeGap)}</p>

      <button
        className="why-button"
        type="button"
        onClick={() => setShowWhy((current) => !current)}
        aria-expanded={showWhy}
      >
        为什么推荐？
      </button>

      {showWhy && (
        <div className="score-explain">
          <div>
            <span>平均耗时</span>
            <strong>{Math.round(place.avgTime)} 分钟</strong>
          </div>
          <div>
            <span>通勤差距</span>
            <strong>{Math.round(place.timeGap)} 分钟</strong>
          </div>
          <div>
            <span>地点评分</span>
            <strong>{place.rating.toFixed(1)} / 5</strong>
          </div>
          <p>
            推荐分综合考虑平均耗时、通勤公平性和地点评分。其中通勤差距越小，公平性越高。
          </p>
        </div>
      )}

      <div className="time-list">
        {timeItems.map((item) => (
          <div className="time-item" key={item.id || item.name}>
            <span>{item.name || '未命名'}</span>
            <strong>{item.time} 分钟</strong>
          </div>
        ))}
      </div>

      {actionLabel && (
        <button
          className={`primary-button small ${actionVariant === 'remove' ? 'remove-action' : ''}`}
          type="button"
          onClick={onAction}
          disabled={actionDisabled}
        >
          {actionLabel}
        </button>
      )}
    </article>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ text, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      <p>{text}</p>
      {actionLabel && (
        <button className="secondary-button empty-action" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function getFairnessClass(label) {
  if (label === '非常公平') return 'great';
  if (label === '较公平') return 'good';
  if (label === '一般') return 'okay';
  return 'bad';
}

function getMapStatusText({ mapContext, mapLoadState }) {
  if (!mapContext) {
    return '当前显示模拟地图：真实地图推荐还没有生成，请重新点击“生成推荐地”。';
  }

  if (mapLoadState === 'failed' || mapLoadState === 'missing-key') {
    return '高德 JS 地图加载失败，正在显示模拟地图。请检查 JS Key、安全密钥和高德控制台域名配置。';
  }

  return '';
}

function getTransportShortName(transport) {
  const shortNames = {
    步行: '步行',
    驾车: '驾车',
    公共交通: '公交',
    骑行: '骑行',
    打车: '打车'
  };

  return shortNames[transport] || '交通';
}

function loadStoredPlan() {
  try {
    const stored = localStorage.getItem(PLAN_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error('Map service timeout')), timeoutMs);
    })
  ]);
}

createRoot(document.getElementById('root')).render(<App />);
