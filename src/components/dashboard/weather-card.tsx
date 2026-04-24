'use client'

import { useState, useEffect } from 'react'
import { CloudSun, Sun, Thermometer, CloudRain } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { fetchRealWeather, type DualWeatherResponse } from '@/app/actions/weather'

export function WeatherCard() {
	const [weather, setWeather] = useState<DualWeatherResponse | null>(null)

	useEffect(() => {
		async function loadWeather() {
			const data = await fetchRealWeather()
			setWeather(data)
		}
		loadWeather()
	}, [])

	const getIcon = (condition: string) => {
		const lower = condition.toLowerCase()
		if (lower.includes('rain') || lower.includes('drizzle')) {
			return <CloudRain className='h-8 w-8 text-blue-400/80' />
		}
		if (lower.includes('cloud') || lower.includes('fog')) {
			return <CloudSun className='h-8 w-8 text-neutral-400/80' />
		}
		return <Sun className='h-8 w-8 text-yellow-500/80' />
	}

	if (!weather) {
		return <WeatherSkeleton />
	}

	return (
		<div
			className={cn(
				'relative flex flex-col justify-between overflow-hidden',
				'rounded-3xl border border-white/5 bg-card/40 p-8',
				'backdrop-blur-xl shadow-xl shadow-black/20 transition-colors',
				'hover:border-primary/20'
			)}
		>
			<div className='relative z-10 flex items-center justify-between'>
				<h2
					className={cn(
						'text-xs font-bold uppercase tracking-[0.2em]',
						'text-muted-foreground'
					)}
				>
					Current Weather
				</h2>
				<div className='rounded-full bg-primary/10 p-2 text-primary'>
					<Thermometer className='h-4 w-4' />
				</div>
			</div>

			<div className='relative z-10 mt-8 grid grid-cols-2 gap-6 divide-x divide-border/40'>
				{/* Al Shorouk Column */}
				<div className='flex flex-col pr-6'>
					<p
						className={cn(
							'mb-4 text-xs font-bold uppercase tracking-wider',
							'text-muted-foreground'
						)}
					>
						Al Shorouk
					</p>
					<div className='flex items-center gap-3'>
						<motion.div
							animate={{ y: [-2, 2, -2] }}
							transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
						>
							{getIcon(weather.myLocation.condition)}
						</motion.div>
						<div className='flex items-start'>
							<span className='text-4xl font-bold tracking-tighter'>
								{weather.myLocation.temp}
							</span>
							<span className='text-lg font-medium text-muted-foreground'>°</span>
						</div>
					</div>
					<div className='mt-4 flex flex-col gap-1'>
						<p className='text-sm font-medium text-foreground/80 truncate'>
							{weather.myLocation.condition}
						</p>
						<p className='text-xs font-medium text-muted-foreground'>
							H: {weather.myLocation.high}° · L: {weather.myLocation.low}°
						</p>
					</div>
				</div>

				{/* Tabuk Column */}
				<div className='flex flex-col pl-6'>
					<p
						className={cn(
							'mb-4 text-xs font-bold uppercase tracking-wider',
							'text-primary/80'
						)}
					>
						Tabuk
					</p>
					<div className='flex items-center gap-3'>
						<motion.div
							animate={{ rotate: 360 }}
							transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
						>
							{getIcon(weather.tabuk.condition)}
						</motion.div>
						<div className='flex items-start'>
							<span className={cn('text-4xl font-bold tracking-tighter', 'text-primary')}>
								{weather.tabuk.temp}
							</span>
							<span className='text-lg font-medium text-primary/60'>°</span>
						</div>
					</div>
					<div className='mt-4 flex flex-col gap-1'>
						<p className='text-sm font-medium text-foreground/80 truncate'>
							{weather.tabuk.condition}
						</p>
						<p className='text-xs font-medium text-muted-foreground'>
							H: {weather.tabuk.high}° · L: {weather.tabuk.low}°
						</p>
					</div>
				</div>
			</div>
		</div>
	)
}

function WeatherSkeleton() {
	// ... (Keep the exact same WeatherSkeleton code you already have)
	return (
		<div className='relative flex flex-col justify-between overflow-hidden rounded-3xl border border-white/5 bg-card/40 p-8 backdrop-blur-xl shadow-xl shadow-black/20'>
			<div className='flex items-center justify-between'>
				<div className='h-4 w-32 rounded-md bg-muted/50 animate-pulse' />
				<div className='h-8 w-8 rounded-full bg-muted/50 animate-pulse' />
			</div>
			<div className='mt-8 grid grid-cols-2 gap-6 divide-x divide-border/40'>
				<div className='flex flex-col pr-6 space-y-4'>
					<div className='h-3 w-12 rounded-md bg-muted/50 animate-pulse' />
					<div className='flex items-center gap-3'>
						<div className='h-8 w-8 rounded-full bg-muted/50 animate-pulse' />
						<div className='h-10 w-16 rounded-md bg-muted/50 animate-pulse' />
					</div>
					<div className='space-y-2 mt-2'>
						<div className='h-4 w-24 rounded-md bg-muted/50 animate-pulse' />
						<div className='h-3 w-20 rounded-md bg-muted/50 animate-pulse' />
					</div>
				</div>
				<div className='flex flex-col pl-6 space-y-4'>
					<div className='h-3 w-16 rounded-md bg-primary/20 animate-pulse' />
					<div className='flex items-center gap-3'>
						<div className='h-8 w-8 rounded-full bg-primary/20 animate-pulse' />
						<div className='h-10 w-16 rounded-md bg-primary/20 animate-pulse' />
					</div>
					<div className='space-y-2 mt-2'>
						<div className='h-4 w-24 rounded-md bg-primary/20 animate-pulse' />
						<div className='h-3 w-20 rounded-md bg-primary/20 animate-pulse' />
					</div>
				</div>
			</div>
		</div>
	)
}