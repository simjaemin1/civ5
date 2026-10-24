import generalUrl from '../assets/icons/general.png'
import cityUrl from '../assets/icons/city.png'
import workerUrl from '../assets/icons/worker.png'

const URLS = { general: generalUrl, worker: workerUrl, city: cityUrl }

/** 일꾼·장군 같은 말 대신 쓰는 동그란 그림 아이콘 */
export function Icon({ name, size = 18, title }: { name: keyof typeof URLS; size?: number; title?: string }) {
  return <img className="icon" src={URLS[name]} width={size} height={size} alt={title ?? ''} title={title} draggable={false} />
}
