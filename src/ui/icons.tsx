import generalUrl from '../assets/icons/general.png'
import cityUrl from '../assets/icons/city.png'
import workerUrl from '../assets/icons/worker.png'

const URLS = { general: generalUrl, worker: workerUrl, city: cityUrl }

/** 일꾼·장군 같은 말 대신 쓰는 동그란 그림 아이콘 */
export function Icon({ name, size = 18, title }: { name: keyof typeof URLS; size?: number; title?: string }) {
  return <img className="icon" src={URLS[name]} width={size} height={size} alt={title ?? ''} title={title} draggable={false} />
}

/** 도시 표시: 첫 도시는 큰 성, 둘째 도시는 작은 성 아이콘 (글자 대신). 마우스를 올리면 "도시 N". */
export function CityTag({ id, label = false }: { id: number; label?: boolean }) {
  const size = id === 0 ? 28 : 17
  return (
    <span className={`citytag ${id === 0 ? 'big' : 'small'}`} title={`도시 ${id + 1}`} aria-label={`도시 ${id + 1}`}>
      <img src={URLS.city} width={size} height={size} alt="" draggable={false} />
      {label && <small>{id + 1}</small>}
    </span>
  )
}
