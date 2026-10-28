type TicketSnapshot = {
	card: HTMLElement;
	stub: HTMLElement;
	copy: HTMLElement;
	stage: HTMLElement;
	target: HTMLElement;
	vertical: boolean;
};

export function captureTicket(form: HTMLFormElement): TicketSnapshot | undefined {
	const card = form.closest<HTMLElement>('.ticket');
	const stub = card?.querySelector<HTMLElement>('.ticket-stub');
	const stage = form.closest<HTMLElement>('.calendar-stage');
	const target =
		stage?.querySelector<HTMLElement>('.counter-seat:not(.own)') ??
		stage?.querySelector<HTMLElement>('[data-counter-value]');
	if (!card || !stub || !stage || !target) return;
	return {
		card,
		stub,
		stage,
		target,
		copy: stub.cloneNode(true) as HTMLElement,
		vertical: getComputedStyle(card).flexDirection === 'column'
	};
}

export async function animateTicket(
	snapshot: TicketSnapshot | undefined,
	take: boolean,
	commit: () => Promise<void>,
	signal: AbortSignal
) {
	if (signal.aborted) return;
	if (!snapshot || matchMedia('(prefers-reduced-motion: reduce)').matches) {
		await commit();
		return;
	}
	const { card, stub, copy, stage, target, vertical: v } = snapshot;
	const animations: Animation[] = [],
		nodes: Element[] = [];
	const style = getComputedStyle(stage);
	const duration = (name: string) => Number.parseFloat(style.getPropertyValue(`--motion-${name}`));
	const run = (element: Element, frames: Keyframe[], options: KeyframeAnimationOptions) => {
		const animation = element.animate(frames, options);
		animations.push(animation);
		// Every cancellation is handled, including the animations running beside the main flight.
		void animation.finished.catch(() => {});
		return animation;
	};
	const cancel = () => animations.forEach((animation) => animation.cancel());
	signal.addEventListener('abort', cancel, { once: true });
	const rect = stub.getBoundingClientRect();
	const ghost = stub.querySelector<HTMLElement>('.ghost')!;
	const layer = document.createElement('div');
	layer.setAttribute('aria-hidden', 'true');
	nodes.push(layer);
	const put = (element: HTMLElement, left: number, top: number, width: number, height: number) => {
		run(
			element,
			[{ left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` }],
			{ duration: 0, fill: 'forwards' }
		);
	};
	copy.querySelector('.ghost')?.remove();
	copy.querySelectorAll('.owned,.owned-short').forEach((node) => node.remove());
	const edge = (host: Element, bodySide = false) => {
		const length = v ? rect.width : rect.height;
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.classList.add('paper-edge', v ? 'edge-v' : 'edge-h');
		if (bodySide) svg.classList.add('body-edge');
		svg.setAttribute('viewBox', v ? `0 0 ${length} 4` : `0 0 4 ${length}`);
		const points: string[] = [];
		for (let at = 0; at <= length; at++) {
			const depth = 0.5 + (Math.sin(at * 2.31) + 1) * 0.65 + (Math.sin(at * 0.79) + 1) * 0.4;
			const d = bodySide ? depth : 4 - depth;
			points.push(v ? `${at},${d}` : `${d},${at}`);
		}
		const base = bodySide ? 0 : 4;
		const polygon = document.createElementNS(svg.namespaceURI, 'polygon');
		polygon.setAttribute(
			'points',
			v
				? `0,${base} ${points.join(' ')} ${length},${base}`
				: `${base},0 ${points.join(' ')} ${base},${length}`
		);
		svg.append(polygon);
		host.append(svg);
		nodes.push(svg);
		return svg;
	};
	try {
		if (take) {
			const origin = stage.getBoundingClientRect();
			const end = target.getBoundingClientRect();
			layer.className = card.className.replace(/\bmine\b/g, '') + ' ticket-flyer';
			layer.dataset.orientation = v ? 'vertical' : 'horizontal';
			layer.dataset.kind = card.dataset.kind;
			put(layer, rect.left - origin.left, rect.top - origin.top, rect.width, rect.height);
			layer.append(copy);
			stage.append(layer);
			card.classList.add('animating-take');
			edge(copy);
			const body = card.querySelector<HTMLElement>('.ticket-body')!;
			const bodyEdge = edge(body, true);
			run(
				bodyEdge,
				[{ clipPath: v ? 'inset(0 100% 0 0)' : 'inset(0 0 100% 0)' }, { clipPath: 'inset(0)' }],
				{ duration: duration('tear'), easing: 'ease-in', fill: 'forwards' }
			);
			const length = v ? rect.width : rect.height;
			for (let at = 10; at < length; at += 30) {
				const p = at / length,
					drift = (Math.random() - 0.5) * 20,
					spin = (Math.random() - 0.5) * 120;
				const fiber = document.createElement('span');
				fiber.className = 'paper-fiber';
				put(
					fiber,
					rect.left - origin.left + (v ? at : rect.width),
					rect.top - origin.top + (v ? rect.height : at),
					1,
					2 + 2 * p
				);
				stage.append(fiber);
				nodes.push(fiber);
				run(
					fiber,
					[
						{ opacity: 0, transform: 'translate(0,0)' },
						{
							opacity: 0.7,
							offset: 0.2,
							transform: `translate(${drift * 0.2}px,3px) rotate(${spin * 0.2}deg)`
						},
						{ opacity: 0, transform: `translate(${drift}px,32px) rotate(${spin}deg)` }
					],
					{
						duration: duration('fiber'),
						delay: duration('tear') * Math.sqrt(p),
						easing: 'ease-in',
						fill: 'both'
					}
				);
			}
			const deg = v ? 7 : -7,
				angle = (deg * Math.PI) / 180,
				px = rect.width / 2,
				py = rect.height / 2;
			const x = px - px * Math.cos(angle) + py * Math.sin(angle),
				y = py - px * Math.sin(angle) - py * Math.cos(angle);
			await run(
				layer,
				[
					{ transform: 'translate(0,0) rotate(0)' },
					{ transform: `translate(${x}px,${y}px) rotate(${deg}deg)` }
				],
				{ duration: duration('tear'), easing: 'cubic-bezier(.45,0,.75,.75)', fill: 'forwards' }
			).finished;
			navigator.vibrate?.(10);
			run(
				body,
				[
					{ transform: 'none' },
					{ transform: v ? 'translateY(2px)' : 'translateX(2px)' },
					{ transform: 'none' }
				],
				{ duration: duration('recoil'), easing: 'ease-out' }
			);
			run(ghost, [{ opacity: 0 }, { opacity: 1 }], {
				duration: duration('fade'),
				delay: duration('release-delay'),
				fill: 'forwards'
			});
			const fade = run(bodyEdge, [{ opacity: 0.85 }, { opacity: 0 }], {
				duration: duration('fade'),
				delay: duration('release-delay'),
				fill: 'forwards'
			});
			void fade.finished.then(
				() => bodyEdge.remove(),
				() => {}
			);
			const dx = end.left + end.width / 2 - rect.left - rect.width / 2,
				dy = end.top + end.height / 2 - rect.top - rect.height / 2;
			const frames: Keyframe[] = [];
			for (let i = 0; i <= 12; i++) {
				const s = i / 12,
					e = 0.2 * s + 0.8 * (s < 0.5 ? 2 * s * s : 1 - (-2 * s + 2) ** 2 / 2);
				const ax = 2 * (1 - e) * e * (dx / 2 - 40) + e * e * dx;
				const ay = 2 * (1 - e) * e * (dy / 2 - 90) + e * e * dy;
				frames.push({
					offset: s,
					transform: `translate(${x * (1 - e) + ax}px,${y * (1 - e) + ay}px) rotate(${deg + (8 - deg) * e}deg) scale(${1 - (1 - end.width / rect.width) * e})`,
					opacity: i === 12 ? 0.9 : 1
				});
			}
			await run(layer, frames, { duration: duration('flight'), easing: 'linear', fill: 'forwards' })
				.finished;
			await commit();
			layer.remove();
			const pop = run(
				target,
				[
					{ transform: 'scale(.3)' },
					{ transform: 'scale(1.35)', offset: 0.6 },
					{ transform: 'scale(1)' }
				],
				{ duration: duration('pop'), easing: 'cubic-bezier(.3,1.4,.5,1)' }
			);
			await pop.finished;
		} else {
			card.classList.add('animating-leave');
			await commit();
			layer.className = 'ticket-restore';
			put(layer, stub.offsetLeft, stub.offsetTop, rect.width, rect.height);
			layer.append(copy);
			card.append(layer);
			const sweep = document.createElement('span');
			sweep.className = 'paper-sweep';
			copy.append(sweep);
			run(ghost, [{ opacity: 1 }, { opacity: 0 }], {
				duration: duration('ghost'),
				fill: 'forwards'
			});
			run(
				copy,
				[{ clipPath: v ? 'inset(100% 0 0 0)' : 'inset(0 0 0 100%)' }, { clipPath: 'inset(0)' }],
				{
					duration: duration('restore-fill'),
					delay: duration('restore-delay'),
					easing: 'cubic-bezier(.3,.7,.2,1)',
					fill: 'both'
				}
			);
			run(
				sweep,
				[
					{ transform: v ? 'translateY(100%)' : 'translateX(100%)', opacity: 0 },
					{ opacity: 0.75, offset: 0.5 },
					{ transform: v ? 'translateY(-100%)' : 'translateX(-100%)', opacity: 0 }
				],
				{ duration: duration('restore-fill'), delay: duration('restore-delay'), fill: 'both' }
			);
			run(
				layer,
				[
					{ filter: 'drop-shadow(0 0 0 var(--color-paper-glow))' },
					{ filter: 'drop-shadow(0 0 var(--seat-size) var(--color-paper-glow))', offset: 0.5 },
					{ filter: 'drop-shadow(0 0 0 var(--color-paper-glow))' }
				],
				{ duration: duration('restore'), fill: 'both' }
			);
			const stars = [
				[6, 0, -12, 11],
				[22, 0.08, 6, 9],
				[38, 0.16, 0, 13],
				[54, 0.05, 10, 9],
				[70, 0.2, -8, 11],
				[84, 0.12, 4, 9],
				[94, 0.26, -6, 8]
			];
			for (const [at, delay, drift, size] of stars) {
				const star = document.createElement('span');
				star.className = 'paper-star';
				put(
					star,
					v ? (rect.width * at) / 100 : rect.width - 12,
					v ? rect.height - 12 : (rect.height * at) / 100,
					size,
					size
				);
				layer.append(star);
				run(
					star,
					[
						{ opacity: 0, transform: 'translate(0,0) scale(.2)' },
						{ opacity: 1, offset: 0.2, transform: 'scale(1)' },
						{
							opacity: 0,
							transform: `translate(${v ? drift : -32}px,${v ? -32 : drift}px) scale(.2)`
						}
					],
					{
						duration: duration('star'),
						delay: delay * 1000,
						easing: 'cubic-bezier(.2,.7,.3,1)',
						fill: 'both'
					}
				);
			}
			await Promise.all(
				layer.getAnimations({ subtree: true }).map((animation) => animation.finished)
			);
		}
	} catch (cause) {
		if (!signal.aborted) throw cause;
	} finally {
		cancel();
		nodes.forEach((node) => node.remove());
		card.classList.remove('animating-take', 'animating-leave');
		signal.removeEventListener('abort', cancel);
	}
}
