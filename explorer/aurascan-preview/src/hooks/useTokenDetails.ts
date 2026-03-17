import useApiResource from './useApiResource';

export default function useTokenDetails(address: string) {
  const { data, loading, setData, setLoading } = useApiResource<any>(
    address ? `/api/v2/tokens/${address}` : null,
    [address],
    { initialData: null, initialLoading: false }
  );

  return {
    info: data,
    loading,
    setInfo: setData,
    setLoading,
  };
}
