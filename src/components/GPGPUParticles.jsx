import { extend } from "@react-three/fiber";
import { useMemo } from "react";
import {
	color,
	instanceIndex,
	uniform,
	instancedArray,
	Fn,
	hash,
	vec2,
	vec3,
	vec4,
	range,
	If,
	rand,
	deltaTime,
	length,
	uv,
	smoothstep,
	saturate,
	texture,
	ceil,
	sqrt,
	min,
	mx_fractal_noise_vec3,
	mix,
} from "three/tsl";
import {
	AdditiveBlending,
	DataTexture,
	FloatType,
	RGBAFormat,
	SpriteNodeMaterial,
	Color,
} from "three/webgpu";
import { useThree, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useControls } from "leva";
import { randInt, lerp } from "three/src/math/MathUtils.js";
import { useEffect, useRef } from "react";

const randValue = /* @__PURE__ */ Fn(({ min, max, seed }) => {
	return hash(instanceIndex.add(seed)).mul(max.sub(min)).add(min);
});

const tmpColor = new Color();

const MODEL_COLORS = {
	Fox: {
		start: "#ff8a00",
		end: "#66f2a5",
		emissiveIntensity: 0.1,
	},
	Book: {
		start: "#fff6a0",
		end: "#55f2aa",
		emissiveIntensity: 0.1,
	},
	Humanoid: {
		start: "#ff6a00",
		end: "#42f5f2",
		emissiveIntensity: 11,
	},
};

export const GPGPUParticles = ({ nbParticles = 500000 }) => {
	const { scene: foxScene } = useGLTF("models/Fox.glb");
	const { scene: bookScene } = useGLTF("models/Open Book.glb");
	const { scene: humanoidScene } = useGLTF("models/Humanoid.glb");

	const {
		curGeometry,
		startColor,
		endColor,
		emissiveIntensity,
		debugColor,
	} = useControls({
		curGeometry: {
			options: ["Fox", "Book", "Humanoid"],
			value: "Humanoid",
		},
		startColor: "#ff6a00",
		endColor: "#42f5f2",
		emissiveIntensity: 0.1,
		debugColor: false,
	});

	const geometries = useMemo(() => {
		const geometries = [];
		const sceneToTraverse = {
			Book: bookScene,
			Fox: foxScene,
			Humanoid: humanoidScene,
		}[curGeometry];

		sceneToTraverse.traverse((child) => {
			if (child.isMesh) {
				geometries.push(child.geometry);
			}
		});
		return geometries;
	}, [curGeometry, bookScene, foxScene, humanoidScene]);

	const targetPositionsTexture = useMemo(() => {
		const size = Math.ceil(Math.sqrt(nbParticles)); // Make a square texture
		const data = new Float32Array(size * size * 4);

		for (let i = 0; i < nbParticles; i++) {
			data[i * 4 + 0] = 0; // X
			data[i * 4 + 1] = 0; // Y
			data[i * 4 + 2] = 0; // Z
			data[i * 4 + 3] = 1; // Alpha (not needed, but required for 4-component format)
		}

		const texture = new DataTexture(
			data,
			size,
			size,
			RGBAFormat,
			FloatType,
		);
		return texture;
	}, [nbParticles]);

	useEffect(() => {
		if (geometries.length === 0) return;
		for (let i = 0; i < nbParticles; i++) {
			const geometryIndex = randInt(0, geometries.length - 1);
			const randomGeometryIndex = randInt(
				0,
				geometries[geometryIndex].attributes.position.count - 1,
			);
			targetPositionsTexture.image.data[i * 4 + 0] =
				geometries[geometryIndex].attributes.position.array[
					randomGeometryIndex * 3 + 0
				];
			targetPositionsTexture.image.data[i * 4 + 1] =
				geometries[geometryIndex].attributes.position.array[
					randomGeometryIndex * 3 + 1
				];
			targetPositionsTexture.image.data[i * 4 + 2] =
				geometries[geometryIndex].attributes.position.array[
					randomGeometryIndex * 3 + 2
				];
			targetPositionsTexture.image.data[i * 4 + 3] = 1;
		}
		targetPositionsTexture.needsUpdate = true;
	}, [geometries]);

	const gl = useThree((state) => state.gl);

	const { nodes, uniforms, computeUpdate } = useMemo(() => {
		const uniforms = {
			color: uniform(color(startColor)),
			endColor: uniform(color(endColor)),
			emissiveIntensity: uniform(emissiveIntensity),
		};

		const spawnPositionBuffer = instancedArray(nbParticles, "vec3");
		const offsetPositionBuffer = instancedArray(nbParticles, "vec3");
		const agesBuffer = instancedArray(nbParticles, "float");

		const spawnPosition = spawnPositionBuffer.element(instanceIndex);
		const offsetPosition = offsetPositionBuffer.element(instanceIndex);
		const age = agesBuffer.element(instanceIndex);

		const lifetime = randValue({ min: 0.1, max: 6, seed: 13 });

		const computeInit = Fn(() => {
			spawnPosition.assign(
				vec3(
					randValue({ min: -3, max: 3, seed: 0 }),
					randValue({ min: -5, max: 3, seed: 1 }),
					randValue({ min: -3, max: 3, seed: 2 }),
				),
			);
			offsetPosition.assign(0);
			age.assign(randValue({ min: 0, max: lifetime, seed: 11 }));
		})().compute(nbParticles);

		gl.computeAsync(computeInit);

		const size = ceil(sqrt(nbParticles));
		const col = instanceIndex.modInt(size).toFloat();
		const row = instanceIndex.div(size).toFloat();
		const x = col.div(size.toFloat());
		const y = row.div(size.toFloat());
		const targetPos = texture(targetPositionsTexture, vec2(x, y)).xyz;

		const instanceSpeed = randValue({
			min: 0.01,
			max: 0.05,
			seed: 12,
		});

		// const offsetSpeed = randValue({
		// 	min: 0.1,
		// 	max: 0.05,
		// 	seed: 14,
		// });

		const offsetSpeed = randValue({
			min: 0.01,
			max: 0.5,
			seed: 16,
		});

		const computeUpdate = Fn(() => {
			const distanceToTarget = targetPos.sub(spawnPosition);
			If(distanceToTarget.length().greaterThan(0.01), () => {
				spawnPosition.addAssign(
					distanceToTarget
						.normalize()
						.mul(
							min(instanceSpeed, distanceToTarget.length()),
						),
				);
			});

			offsetPosition.addAssign(
				mx_fractal_noise_vec3(spawnPosition.mul(age))
					.mul(offsetSpeed)
					.mul(deltaTime),
			);

			age.addAssign(deltaTime);

			If(age.greaterThan(lifetime), () => {
				age.assign(0);
				offsetPosition.assign(0);
			});

			// offsetPosition.addAssign(vec3(instanceSpeed));
		})().compute(nbParticles);

		const scale = vec3(range(0.001, 0.01));

		const particleLifetimeProgress = saturate(age.div(lifetime));

		const colorNode = vec4(
			mix(
				uniforms.color,
				uniforms.endColor,
				particleLifetimeProgress,
			),
			randValue({ min: 0.5, max: 1, seed: 15 }),
		);

		const dist = length(uv().sub(0.5));
		const circle = smoothstep(0.5, 0.49, dist);
		const finalColor = colorNode.mul(circle);

		const randOffset = vec3(
			range(0, 0),
			range(-0.1, 0.1),
			range(0, 0),
		);

		return {
			uniforms,
			computeUpdate,
			nodes: {
				positionNode: spawnPosition
					.add(offsetPosition)
					.add(randOffset),
				colorNode: finalColor,
				emissiveNode: finalColor.mul(uniforms.emissiveIntensity),
				scaleNode: scale.mul(
					smoothstep(1, 0, particleLifetimeProgress),
				),
			},
		};
	}, []);

	const lerpedStartColor = useRef(
		new Color(MODEL_COLORS[curGeometry].start),
	);
	const lerpedEndColor = useRef(
		new Color(MODEL_COLORS[curGeometry].end),
	);

	useFrame((_, delta) => {
		gl.compute(computeUpdate);
		tmpColor.set(
			debugColor ? startColor : MODEL_COLORS[curGeometry].start,
		);
		lerpedStartColor.current.lerp(tmpColor, delta);
		tmpColor.set(
			debugColor ? endColor : MODEL_COLORS[curGeometry].end,
		);
		lerpedEndColor.current.lerp(tmpColor, delta);
		uniforms.color.value.copy(lerpedStartColor.current);
		uniforms.endColor.value.copy(lerpedEndColor.current);

		uniforms.emissiveIntensity.value = lerp(
			uniforms.emissiveIntensity.value,
			debugColor
				? emissiveIntensity
				: MODEL_COLORS[curGeometry].emissiveIntensity,
			delta,
		);
	});

	return (
		<sprite count={nbParticles}>
			<spriteNodeMaterial
				{...nodes}
				transparent={true}
				blending={AdditiveBlending}
				depthWrite={false}
				// colorNode={nodes.colorNode}
				// size={1}
				// sizeAttenuation={true}
				// nbParticles={nbParticles}
			/>
		</sprite>
	);
};

extend({ SpriteNodeMaterial });
