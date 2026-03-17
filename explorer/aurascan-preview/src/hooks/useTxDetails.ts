import useApiResource from './useApiResource';

export default function useTxDetails(hash: string) {
  const { data, loading, setData, setLoading } = useApiResource<any>(
    hash ? `/api/v2/transactions/${hash}` : null,
    [hash],
    { initialData: null, initialLoading: true }
  );

  return {
    tx: data,
    loading,
    setTx: setData,
    setLoading,
  };
}
