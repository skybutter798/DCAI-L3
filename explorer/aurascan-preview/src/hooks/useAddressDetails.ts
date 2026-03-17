import useApiResource from './useApiResource';

export function useAddressDetails(address: string) {
  const { data, loading, setData, setLoading } = useApiResource<any>(
    address ? `/api/v2/addresses/${address}` : null,
    [address],
    { initialData: null, initialLoading: true }
  );

  return {
    info: data,
    loading,
    setInfo: setData,
    setLoading,
  };
}

export function useAddressTokenMeta(address: string) {
  const { data, loading, setData, setLoading } = useApiResource<any>(
    address ? `/api/v2/tokens/${address}` : null,
    [address],
    {
      initialData: null,
      initialLoading: true,
      treat404As: null,
      map: (json) => (json?.address ? json : null),
    }
  );

  return {
    tokenMeta: data,
    tokenMetaLoading: loading,
    setTokenMeta: setData,
    setTokenMetaLoading: setLoading,
  };
}

export function useSmartContractDetails(address: string, enabled: boolean) {
  const { data, loading, setData, setLoading } = useApiResource<any>(
    enabled && address ? `/api/v2/smart-contracts/${address}` : null,
    [address, enabled],
    {
      initialData: null,
      initialLoading: false,
      treat404As: null,
    }
  );

  return {
    contract: data,
    contractLoading: loading,
    setContract: setData,
    setContractLoading: setLoading,
  };
}
