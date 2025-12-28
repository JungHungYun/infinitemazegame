function updateChaser(dt) {
    if (!state.chaser.active) return;
    // 보스전 중에는 추격자 미사일/로직 자체를 진행하지 않음
    if (state.boss.active) return;
    // 보스전 직후엔 일정 시간 추격자/미사일 등장 금지
    if (state.chaser.bossCooldownUntilMs && state.nowMs < state.chaser.bossCooldownUntilMs) return;
    
    // 살상 미사일에 의해 파괴된 경우 처리
    if (state.chaser.deadUntilNextChunk) return;

    // 플레이어와 같은 청크에 있는지 확인
    const isPlayerInChaserChunk = state.currentChunk.x === state.chaser.chunk.x && state.chaser.chunk.y === state.currentChunk.y;
    
    // 플레이어와 같은 청크에 있을 때만 미사일 발사 및 충돌 체크
    if (isPlayerInChaserChunk) {
        // 청크 진입 연출: 아직 등장 시간이 아니면 아예 미존재 처리
        if (!state.chaser.isPresentInMaze) {
            if (state.chaser.entryScheduledUntilMs && state.nowMs >= state.chaser.entryScheduledUntilMs) {
                const dir = state.chaser.entryScheduledDir || state.currentEntryDir || 'S';
                
                // 리스폰 타이머(3초 점멸 예고) 체크
                if (state.chaser.respawnTimerMs > 0) {
                    state.chaser.respawnTimerMs -= dt;
                    if (state.chaser.respawnTimerMs <= 0) {
                        materializeChaserIntoPlayerChunk(dir);
                        updateUI();
                    }
                    return;
                } else {
                    materializeChaserIntoPlayerChunk(dir);
                    updateUI();
                }
            } else {
                return;
            }
        }
        
        // 20렙부터 레이저 발사 (같은 청크에 있을 때만)
        if (getFloor() >= 20 && state.nowMs - state.chaser.lastShotMs > 5000) {
            state.chaser.lastShotMs = state.nowMs;
            const dx = state.player.mazePos.x - state.chaser.pos.x;
            const dy = state.player.mazePos.y - state.chaser.pos.y;
            const dist = Math.sqrt(dx*dx + dy*dy) || 1;
            const speed = CONFIG.MISSILE_SPEED / 2;
            state.chaserProjectiles.push({
                pos: { x: state.chaser.pos.x, y: state.chaser.pos.y },
                vel: { x: (dx/dist)*speed, y: (dy/dist)*speed },
                chunk: { x: state.chaser.chunk.x, y: state.chaser.chunk.y }
            });
            playSfx('resource/chaser_missile-44538.mp3', { volume: 0.7, rate: 1.0 });
        }

        // 플레이어와 직접 충돌 체크
        const pdx = state.player.mazePos.x - state.chaser.pos.x;
        const pdy = state.player.mazePos.y - state.chaser.pos.y;
        const pdist = Math.sqrt(pdx*pdx + pdy*pdy);
        const isStunned = state.nowMs < state.chaser.stunUntilMs;
        if (!isStunned && pdist < (CONFIG.PLAYER_RADIUS + CONFIG.CHASER_RADIUS) * 0.8) {
            if (state.nowMs > state.chaser.graceUntilMs) {
                applyPlayerHit({
                    livesLoss: 1,
                    canUseShield: true,
                    flashA: 0.25,
                    flashColor: '#ff0000',
                    shake: 5.0,
                    sfx: 'resource/missile-explosion-168600.mp3',
                });
                state.chaser.graceUntilMs = state.nowMs + 1500;
            }
        }
        
        // 잡힘 판정
        const rx = state.chaser.pos.x - state.player.mazePos.x;
        const ry = state.chaser.pos.y - state.player.mazePos.y;
        const hitR = CONFIG.CHASER_RADIUS + CONFIG.PLAYER_RADIUS;
        if (rx * rx + ry * ry <= hitR * hitR) {
            resetAfterCaught();
        }
    }

    // 스턴/유예 시간 동안은 추격자 정지
    if (state.nowMs < state.chaser.stunUntilMs) return;
    if (state.nowMs < state.chaser.graceUntilMs) return;

    // 경로 기반 시뮬레이션: 플레이어 경로를 따라가기
    const pathHistory = state.player.pathHistory || [];
    const pathIndex = state.chaser.pathHistoryIndex || 0;
    
    // 플레이어와 같은 청크에 있으면 플레이어를 직접 추적
    if (isPlayerInChaserChunk) {
        const chaserChunkKey = getChunkKey(state.chaser.chunk.x, state.chaser.chunk.y);
        const chunk = state.chunks.get(chaserChunkKey);
        if (!chunk) return;
        const maze = chunk.maze;
        
        const dtSec = Math.min(dt, 50) / 1000;
        let speed = CONFIG.CHASER_SPEED * state.chaser.speedMult;
        if (state.nowMs < state.chaser.slowUntilMs) {
            speed *= CONFIG.GUNPOWDER_SLOW_MULT;
        }
        const moveDist = speed * dtSec;
        
        const targetTile = { x: Math.floor(state.player.mazePos.x), y: Math.floor(state.player.mazePos.y) };
        const chaserTile = { x: Math.floor(state.chaser.pos.x), y: Math.floor(state.chaser.pos.y) };
        
        const needRepath =
            !state.chaser.lastTargetTile ||
            state.chaser.lastTargetTile.x !== targetTile.x ||
            state.chaser.lastTargetTile.y !== targetTile.y ||
            (state.nowMs - state.chaser.lastRepathMs) > CONFIG.CHASER_REPATH_MS ||
            state.chaser.path.length === 0 ||
            state.chaser.pathIndex >= state.chaser.path.length;
        
        if (needRepath) {
            const path = bfsPath(maze, chaserTile, targetTile);
            state.chaser.path = path;
            state.chaser.pathIndex = path.length > 1 ? 1 : 0;
            state.chaser.lastRepathMs = state.nowMs;
            state.chaser.lastTargetTile = { ...targetTile };
        }
        
        if (state.chaser.path.length <= 1) return;
        
        let remaining = moveDist;
        while (remaining > 0 && state.chaser.pathIndex < state.chaser.path.length) {
            const target = state.chaser.path[state.chaser.pathIndex];
            const tx = target.x + 0.5;
            const ty = target.y + 0.5;
            const dx = tx - state.chaser.pos.x;
            const dy = ty - state.chaser.pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 1e-6) {
                state.chaser.pathIndex += 1;
                continue;
            }
            const step = Math.min(remaining, dist);
            state.chaser.pos.x += (dx / dist) * step;
            state.chaser.pos.y += (dy / dist) * step;
            remaining -= step;
            if (step === dist) state.chaser.pathIndex += 1;
        }
        return;
    }
    
    // 플레이어와 다른 청크에 있으면 경로 기반 시뮬레이션
    if (pathIndex >= pathHistory.length) {
        // 경로가 없으면 대기 (플레이어가 아직 청크를 이동하지 않음)
        return;
    }
    
    // 현재 따라가고 있는 경로 항목 가져오기
    const currentPath = pathHistory[pathIndex];
    if (!currentPath) return;
    
    // 현재 경로의 청크 정보
    const simulatedChunkKey = getChunkKey(currentPath.chunk.x, currentPath.chunk.y);
    let simulatedChunk = state.chunks.get(simulatedChunkKey);
    if (!simulatedChunk) {
        // 청크가 없으면 생성 (가상 시뮬레이션을 위해)
        simulatedChunk = new Chunk(currentPath.chunk.x, currentPath.chunk.y);
        state.chunks.set(simulatedChunkKey, simulatedChunk);
    }
    
    // 추적자가 현재 경로의 청크에 있는지 확인
    const isChaserInPathChunk = state.chaser.chunk.x === currentPath.chunk.x && state.chaser.chunk.y === currentPath.chunk.y;
    
    // 추적자가 경로 청크에 없으면 입구로 이동
    if (!isChaserInPathChunk) {
        state.chaser.chunk.x = currentPath.chunk.x;
        state.chaser.chunk.y = currentPath.chunk.y;
        const entryPos = getSpawnPosForEntry(currentPath.entryDir);
        state.chaser.pos = { ...entryPos };
        state.chaser.isPresentInMaze = true; // 시뮬레이션 중이므로 항상 표시
        state.chaser.path = [];
        state.chaser.pathIndex = 0;
        state.chaser.lastRepathMs = 0;
        state.chaser.lastTargetTile = null;
    }
    
    // 현재 청크에서 출구로 이동 시뮬레이션
    const maze = simulatedChunk.maze;
    const dtSec = Math.min(dt, 50) / 1000;
    let speed = CONFIG.CHASER_SPEED * state.chaser.speedMult;
    if (state.nowMs < state.chaser.slowUntilMs) {
        speed *= CONFIG.GUNPOWDER_SLOW_MULT;
    }
    const moveDist = speed * dtSec;
    
    // 출구 방향으로 타겟 설정
    const size = CONFIG.MAZE_SIZE;
    let targetTile;
    if (currentPath.exitDir === 'W') targetTile = { x: 0, y: Math.floor(size / 2) };
    else if (currentPath.exitDir === 'E') targetTile = { x: size - 1, y: Math.floor(size / 2) };
    else if (currentPath.exitDir === 'S') targetTile = { x: Math.floor(size / 2), y: 0 };
    else if (currentPath.exitDir === 'N') targetTile = { x: Math.floor(size / 2), y: size - 1 };
    else targetTile = { x: Math.floor(size / 2), y: Math.floor(size / 2) };
    
    const chaserTile = { x: Math.floor(state.chaser.pos.x), y: Math.floor(state.chaser.pos.y) };
    
    const needRepath =
        !state.chaser.lastTargetTile ||
        state.chaser.lastTargetTile.x !== targetTile.x ||
        state.chaser.lastTargetTile.y !== targetTile.y ||
        (state.nowMs - state.chaser.lastRepathMs) > CONFIG.CHASER_REPATH_MS ||
        state.chaser.path.length === 0 ||
        state.chaser.pathIndex >= state.chaser.path.length;
    
    if (needRepath) {
        const path = bfsPath(maze, chaserTile, targetTile);
        state.chaser.path = path;
        state.chaser.pathIndex = path.length > 1 ? 1 : 0;
        state.chaser.lastRepathMs = state.nowMs;
        state.chaser.lastTargetTile = { ...targetTile };
    }
    
    if (state.chaser.path.length <= 1) return;
    
    let remaining = moveDist;
    while (remaining > 0 && state.chaser.pathIndex < state.chaser.path.length) {
        const target = state.chaser.path[state.chaser.pathIndex];
        const tx = target.x + 0.5;
        const ty = target.y + 0.5;
        const dx = tx - state.chaser.pos.x;
        const dy = ty - state.chaser.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1e-6) {
            state.chaser.pathIndex += 1;
            continue;
        }
        const step = Math.min(remaining, dist);
        state.chaser.pos.x += (dx / dist) * step;
        state.chaser.pos.y += (dy / dist) * step;
        remaining -= step;
        if (step === dist) state.chaser.pathIndex += 1;
    }
    
    // 출구 도달 체크
    const margin = 0.3;
    let exitDir = null;
    if (state.chaser.pos.x < margin) exitDir = 'W';
    else if (state.chaser.pos.x > size - margin) exitDir = 'E';
    else if (state.chaser.pos.y < margin) exitDir = 'S';
    else if (state.chaser.pos.y > size - margin) exitDir = 'N';
    
    // 출구에 도달했고, 출구 방향이 경로의 exitDir과 일치하면 다음 경로로 이동
    if (exitDir && exitDir === currentPath.exitDir) {
        // 다음 경로로 이동
        state.chaser.pathHistoryIndex = pathIndex + 1;
        
        // 통과한 경로 항목 제거 (메모리 절약)
        state.player.pathHistory.splice(0, pathIndex + 1);
        // 인덱스 조정 (배열이 줄어들었으므로)
        state.chaser.pathHistoryIndex = 0;
        
        // 다음 경로가 있으면 해당 청크로 이동
        if (state.player.pathHistory.length > 0) {
            const nextPath = state.player.pathHistory[0];
            state.chaser.chunk.x = nextPath.chunk.x;
            state.chaser.chunk.y = nextPath.chunk.y;
            const entryPos = getSpawnPosForEntry(nextPath.entryDir);
            state.chaser.pos = { ...entryPos };
            state.chaser.path = [];
            state.chaser.pathIndex = 0;
            state.chaser.lastRepathMs = 0;
            state.chaser.lastTargetTile = null;
        } else {
            // 경로가 끝났으면 플레이어와 같은 청크에 도달한 것
            // 실제로는 플레이어 청크로 이동하지 않고 대기
        }
    }
}

