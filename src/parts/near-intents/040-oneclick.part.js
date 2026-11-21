  async function quoteRawOneClick(params = {}) {
    const {
      originAsset,
      destinationAsset,
      amountRaw,
      slippageBps = 100,
      recipient,
      refundTo,
      depositType = 'ORIGIN_CHAIN',
      recipientType = 'DESTINATION_CHAIN',
      refundType,
      dry = true,
      appFeeBps = 25,
      referral = DEFAULT_REFERRAL_ACCOUNT,
      deadlineIso,
      signal = null
    } = params;

    if (signal && signal.aborted) {
      return { ok: false, quote: null, depositAddress: null, memo: null, amountOut: null, amountOutFormatted: null, amountInUsd: null, amountOutUsd: null, serviceFeeBps: 0, error: t('请求已取消', 'Request aborted') };
    }

    const resolvedOriginAsset = resolveOneClickAssetId(originAsset, params.originBlockchain || '');
    const resolvedDestAsset = resolveOneClickAssetId(destinationAsset, params.destinationBlockchain || '');
    const resolvedDepositType = depositType === 'INTENTS' ? 'INTENTS' : 'ORIGIN_CHAIN';
    const resolvedRefundType = refundType || (resolvedDepositType === 'INTENTS' ? 'INTENTS' : 'ORIGIN_CHAIN');
    const resolvedRefundTo = refundTo || recipient;
    const resolvedReferral = referral || DEFAULT_REFERRAL_ACCOUNT;
    const feeBps = Number.isFinite(Number(appFeeBps)) ? Math.max(0, Math.round(Number(appFeeBps))) : 25;
    const isDry = Boolean(dry);
    const curFetch = (typeof globalThis !== 'undefined' && globalThis.fetch) || null;
    const ocKey = isDry
      ? `oc:${resolvedOriginAsset}|${resolvedDestAsset}|${amountRaw}|${slippageBps}|${resolvedDepositType}|${recipientType}|${recipient}|${resolvedRefundTo}|${feeBps}`
      : '';
    if (isDry) {
      const hit = _oneClickQuoteCache.get(ocKey);
      if (hit && hit.fetchRef === curFetch && Date.now() - hit.ts < 10_000) {
        return { ...hit.val };
      }
      const inflight = _oneClickQuoteInFlight.get(ocKey);
      if (inflight && inflight.fetchRef === curFetch) {
        const res = await (signal
          ? Promise.race([
              inflight.promise,
              new Promise((r) => {
                const onA = () => r({ ok: false, aborted: true, error: t('请求已取消', 'Request aborted') });
                if (signal.aborted) onA();
                else signal.addEventListener('abort', onA, { once: true });
              })
            ])
          : inflight.promise);
        return res && typeof res === 'object' ? { ...res } : res;
      }
    }

    const body = {
      dry: isDry,
      swapType: 'EXACT_INPUT',
      slippageTolerance: Number(slippageBps) || 100,
      originAsset: resolvedOriginAsset,
      depositType: resolvedDepositType,
      destinationAsset: resolvedDestAsset,
      amount: String(amountRaw),
      refundTo: resolvedRefundTo,
      refundType: resolvedRefundType,
      recipient,
      recipientType: recipientType || 'DESTINATION_CHAIN',
      deadline: deadlineIso || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      referral: resolvedReferral
    };
    if (feeBps > 0 && resolvedReferral) {
      body.appFees = [{ recipient: resolvedReferral, fee: feeBps }];
    }

    const postQuote = async (reqBody) => {
      if (signal && signal.aborted) {
        return { ok: false, status: 0, aborted: true, error: t('请求已取消', 'Request aborted') };
      }
      const resp = await fetchJsonWithTimeout(
        `${ONECLICK_API_URL}/quote`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
          signal: isDry && _oneClickQuoteInFlight.has(ocKey) ? undefined : signal
        },
        dry ? 7000 : DEFAULT_TIMEOUT_MS
      );
      const json = resp.data;
      if (resp.ok && json && json.quote) {
        const q = json.quote;
        return {
          ok: true,
          quote: q,
          depositAddress: json.depositAddress || q.depositAddress || null,
          memo: json.memo || q.depositMemo || null,
          amountOut: q.amountOut !== undefined ? String(q.amountOut) : null,
          amountOutFormatted: q.amountOutFormatted !== undefined ? String(q.amountOutFormatted) : null,
          amountInUsd: q.amountInUsd !== undefined ? String(q.amountInUsd) : null,
          amountOutUsd: q.amountOutUsd !== undefined ? String(q.amountOutUsd) : null,
          serviceFeeBps: feeBps,
          error: null
        };
      }
      const errMsg =
        (json && (json.message || json.error)) ||
        (resp.status ? `HTTP ${resp.status}: ${resp.statusText || 'Quote failed'}` : 'Quote unavailable');
      return { ok: false, status: resp.status, error: String(errMsg) };
    };

    const runOneClick = async () => {
      const firstTry = await postQuote(body);
      if (firstTry.ok || firstTry.aborted || (signal && signal.aborted)) return firstTry;

      const isNearAddr = (s) => /\.near$/i.test(String(s || '').trim()) || /^[0-9a-f]{64}$/i.test(String(s || '').trim());
      const nearAcct = params.nearAccountId
        || (isNearAddr(recipient) ? recipient : '')
        || (isNearAddr(resolvedRefundTo) ? resolvedRefundTo : '');

      if (
        isDry &&
        firstTry.status === 400 &&
        nearAcct &&
        String(destinationAsset).startsWith('nep141:') &&
        !String(destinationAsset).startsWith('1cs_v1:near:') &&
        /recipient is not valid|refundTo is not valid|No liquidity available/i.test(firstTry.error || '')
      ) {
        const retryNear = await postQuote({
          ...body,
          destinationAsset: `1cs_v1:near:${destinationAsset}`,
          recipient: nearAcct,
          recipientType: 'DESTINATION_CHAIN'
        });
        if (retryNear.ok || (signal && signal.aborted)) return retryNear;
      }

      let finalError = firstTry.error;
      const minMatch = String(finalError || '').match(/Amount is too low for bridge,\s*try at least\s*(\d+)/i);
      if (minMatch) {
        const dec = resolveTokenDecimals(resolvedOriginAsset);
        const rawStr = fromBaseUnits(minMatch[1], dec);
        const rawNum = Number(rawStr);
        const minHuman = Number.isFinite(rawNum) && rawNum > 0
          ? (rawNum >= 1e-6 && rawNum < 1e12 ? String(Number(rawNum.toPrecision(6))) : rawStr)
          : rawStr;
        finalError = t(`跨链金额过低，最低需约 ${minHuman}`, `Amount too low for bridge (min ~${minHuman})`);
      }

      return {
        ok: false,
        quote: null,
        depositAddress: null,
        memo: null,
        amountOut: null,
        amountOutFormatted: null,
        amountInUsd: null,
        amountOutUsd: null,
        serviceFeeBps: feeBps,
        error: finalError
      };
    };

    if (!isDry) return runOneClick();
    const ocPromise = runOneClick();
    _oneClickQuoteInFlight.set(ocKey, { fetchRef: curFetch, promise: ocPromise });
    try {
      const result = await ocPromise;
      if (result && result.ok) {
        _oneClickQuoteCache.set(ocKey, { ts: Date.now(), fetchRef: curFetch, val: result });
        if (_oneClickQuoteCache.size > 100) _oneClickQuoteCache.delete(_oneClickQuoteCache.keys().next().value);
      }
      return result;
    } finally {
      const cur = _oneClickQuoteInFlight.get(ocKey);
      if (cur && cur.promise === ocPromise) _oneClickQuoteInFlight.delete(ocKey);
    }
  }

  /**
   * Composite Ref Finance (#9010) + 1Click router for PRL pairs across Pearl, NEAR, and external chains.
   */
  async function quoteCompositePrlSwap({
    originAsset,
    destinationAsset,
    amountRaw,
    slippageBps = 100,
    recipient,
    refundTo,
    nearAccountId,
    signal = null
  } = {}) {
    try {
      const originIsPrl = isPrlAssetId(originAsset);
      const destIsPrl = isPrlAssetId(destinationAsset);
      const amtStr = String(amountRaw || '0').trim();
      const nearAccount = nearAccountId || recipient || refundTo;

      // Case 1: PRL (Pearl) <-> PRL (NEAR) -> native 1Click 1:1 bridge
      if (originIsPrl && destIsPrl) {
        return await quoteRawOneClick({
          originAsset,
          destinationAsset,
          amountRaw: amtStr,
          slippageBps,
          recipient,
          refundTo: refundTo || recipient,
          nearAccountId: nearAccount,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: true,
          signal
        });
      }

      // Case 2: Selling PRL -> NEAR token or External chain token
      if (originIsPrl) {
        let effectivePrlIn = amtStr;
        let bridgeQuote = null;
        let bridgeFeeCharged = 0;
        const originIsPearlL1 = String(originAsset).toLowerCase() === PRL_PEARL_ASSET_ID;
        const directNearDest = extractNearTokenContract(destinationAsset);
        if (originIsPearlL1) {
          const wantedBridgeFee = directNearDest ? 25 : 0;
          bridgeQuote = await quoteRawOneClick({
            originAsset: PRL_PEARL_ASSET_ID,
            destinationAsset: PRL_NEAR_ASSET_ID,
            amountRaw: amtStr,
            slippageBps,
            recipient: nearAccount,
            refundTo: refundTo || nearAccount,
            nearAccountId: nearAccount,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            appFeeBps: wantedBridgeFee,
            dry: true,
            signal
          }).catch((e) => ({ ok: false, error: e && e.message ? e.message : '' }));
          if (!bridgeQuote || !bridgeQuote.ok || !bridgeQuote.amountOut || BigInt(bridgeQuote.amountOut) <= 0n) {
            return {
              ok: false,
              quote: null,
              depositAddress: null,
              memo: null,
              amountOut: null,
              amountOutFormatted: null,
              amountInUsd: null,
              amountOutUsd: null,
              serviceFeeBps: 0,
              error: (bridgeQuote && bridgeQuote.error) || t('PRL 跨链至 NEAR 桥接报价失败', 'PRL bridge-in quote unavailable')
            };
          }
          effectivePrlIn = bridgeQuote.amountOut;
          bridgeFeeCharged = wantedBridgeFee;
        }

        if (directNearDest) {
          let refQ = await quoteRefSmartRouterPath({
            tokenIn: PRL_NEAR_CONTRACT,
            tokenOut: directNearDest,
            amountRaw: effectivePrlIn,
            slippageBps,
            signal
          });
          if (!refQ.ok) {
            // Multi-hop fallback (e.g. PRL -> USDC -> RHEA -> oRHEA) via Ref v2 pools in a single atomic route
            const helper = getContractsHelper();
            if (helper && typeof helper.quoteNearRefFinanceSwap === 'function') {
              const alt = await helper.quoteNearRefFinanceSwap({
                tokenIn: PRL_NEAR_CONTRACT,
                tokenOut: directNearDest,
                amountRaw: effectivePrlIn,
                slippageBps,
                signal
              }).catch(() => null);
              if (alt && alt.ok) refQ = alt;
            }
          }
          // Only short-circuit if Ref Finance actually has a direct route; otherwise fall through to PRL->USDC->1Click
          if (refQ.ok) {
            const dec = NEAR_ASSET_DECIMALS[String(destinationAsset).toLowerCase()] || resolveTokenDecimals(destinationAsset);
            return {
              ok: true,
              compositeType: 'PRL_TO_NEAR_REF',
              refQuote: refQ,
              bridgeQuote,
              depositAddress: null,
              memo: null,
              amountOut: refQ.amountOut,
              amountOutFormatted: fromBaseUnits(refQ.amountOut, dec),
              amountInUsd: bridgeQuote ? bridgeQuote.amountInUsd : null,
              amountOutUsd: null,
              serviceFeeBps: bridgeFeeCharged,
              error: null
            };
          }
        }

        // PRL -> USDC (Ref Finance Pool #9010) -> Destination Chain / DCL / 1Click Token
        const refToUsdc = await quoteRefSmartRouterPath({
          tokenIn: PRL_NEAR_CONTRACT,
          tokenOut: NEAR_USDC_CONTRACT,
          amountRaw: effectivePrlIn,
          slippageBps,
          signal
        });
        if (!refToUsdc.ok) {
          return { ok: false, quote: null, depositAddress: null, memo: null, amountOut: null, amountOutFormatted: null, amountInUsd: null, amountOutUsd: null, error: refToUsdc.error };
        }
        const exitFeeBps = bridgeFeeCharged > 0 ? 0 : 25;
        const totalFeeBps = bridgeFeeCharged > 0 ? bridgeFeeCharged : 25;
        // When buying NEAR-side QTC, concurrently compare Rhea CLMM (dclv2) vs 1Click Solver and pick the highest output
        if (String(destinationAsset).toLowerCase() === QTC_NEAR_ASSET_ID) {
          const [dclRes, oneClickRes] = await Promise.allSettled([
            quoteNearDclPoolSwap({
              tokenIn: NEAR_USDC_CONTRACT,
              tokenOut: QTC_NEAR_CONTRACT,
              amountRaw: refToUsdc.amountOut,
              slippageBps,
              signal
            }).catch(() => null),
            quoteRawOneClick({
              originAsset: NEAR_USDC_ASSET_ID,
              destinationAsset,
              amountRaw: refToUsdc.amountOut,
              slippageBps,
              recipient,
              refundTo: nearAccount,
              nearAccountId: nearAccount,
              depositType: 'ORIGIN_CHAIN',
              recipientType: 'DESTINATION_CHAIN',
              appFeeBps: exitFeeBps,
              dry: true,
              signal
            }).catch(() => null)
          ]);
          const candidates = [];
          const dclStep2 = dclRes.status === 'fulfilled' ? dclRes.value : null;
          if (dclStep2 && dclStep2.ok && /^\d+$/.test(String(dclStep2.amountOut || '0')) && BigInt(dclStep2.amountOut) > 0n) {
            candidates.push({
              source: 'Ref #9010 + Rhea CLMM (dclv2)',
              outBig: BigInt(dclStep2.amountOut),
              payload: {
                ok: true,
                compositeType: 'PRL_TO_NEAR_DCL',
                refQuote: refToUsdc,
                dclQuote: dclStep2,
                bridgeQuote,
                intermediaryUsdcAssetId: NEAR_USDC_ASSET_ID,
                intermediaryUsdcContract: NEAR_USDC_CONTRACT,
                intermediaryUsdcRaw: refToUsdc.amountOut,
                depositAddress: null,
                memo: null,
                amountOut: dclStep2.amountOut,
                amountOutFormatted: fromBaseUnits(dclStep2.amountOut, 12),
                amountInUsd: bridgeQuote ? bridgeQuote.amountInUsd : null,
                amountOutUsd: null,
                serviceFeeBps: bridgeFeeCharged,
                error: null
              }
            });
          }
          const oneClickStep2 = oneClickRes.status === 'fulfilled' ? oneClickRes.value : null;
          if (oneClickStep2 && oneClickStep2.ok && /^\d+$/.test(String(oneClickStep2.amountOut || '0')) && BigInt(oneClickStep2.amountOut) > 0n) {
            candidates.push({
              source: 'Ref #9010 + 1Click Solver',
              outBig: BigInt(oneClickStep2.amountOut),
              payload: {
                ...oneClickStep2,
                compositeType: 'PRL_TO_EXTERNAL',
                refQuote: refToUsdc,
                oneClickQuote: oneClickStep2,
                bridgeQuote,
                intermediaryUsdcAssetId: NEAR_USDC_ASSET_ID,
                intermediaryUsdcContract: NEAR_USDC_CONTRACT,
                intermediaryUsdcRaw: refToUsdc.amountOut,
                serviceFeeBps: totalFeeBps
              }
            });
          }
          if (candidates.length > 0) {
            candidates.sort((a, b) => (b.outBig > a.outBig ? 1 : b.outBig < a.outBig ? -1 : 0));
            const best = candidates[0];
            return {
              ...best.payload,
              comparedPools: candidates.length,
              bestSource: best.source,
              routeLabel: candidates.length > 1
                ? `⚡ ${t('最优', 'Best')}: ${best.source} (${t(`比价 ${candidates.length} 池`, `${candidates.length} pools`)})`
                : best.source
            };
          }
        }
        const oneClickStep2 = await quoteRawOneClick({
          originAsset: NEAR_USDC_ASSET_ID,
          destinationAsset,
          amountRaw: refToUsdc.amountOut,
          slippageBps,
          recipient,
          refundTo: nearAccount,
          nearAccountId: nearAccount,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          appFeeBps: exitFeeBps,
          dry: true,
          signal
        });
        if (!oneClickStep2.ok) return oneClickStep2;
        return {
          ...oneClickStep2,
          compositeType: 'PRL_TO_EXTERNAL',
          refQuote: refToUsdc,
          oneClickQuote: oneClickStep2,
          bridgeQuote,
          intermediaryUsdcAssetId: NEAR_USDC_ASSET_ID,
          intermediaryUsdcContract: NEAR_USDC_CONTRACT,
          intermediaryUsdcRaw: refToUsdc.amountOut,
          serviceFeeBps: totalFeeBps
        };
      }

      // Case 3: Buying PRL <- NEAR token or External chain token
      if (destIsPrl) {
        const destIsPearlL1 = String(destinationAsset).toLowerCase() === PRL_PEARL_ASSET_ID;
        const directNearSrc = extractNearTokenContract(originAsset);
        if (directNearSrc) {
          const refQ = await quoteRefSmartRouterPath({
            tokenIn: directNearSrc,
            tokenOut: PRL_NEAR_CONTRACT,
            amountRaw: amtStr,
            slippageBps,
            signal
          });
          // Only return immediately if Ref Finance has direct pool liquidity; otherwise fall through to 1Click->USDC->PRL
          if (refQ.ok) {
            let finalPrlOut = refQ.amountOut;
            let bridgeQuote = null;
            if (destIsPearlL1) {
              bridgeQuote = await quoteRawOneClick({
                originAsset: PRL_NEAR_ASSET_ID,
                destinationAsset: PRL_PEARL_ASSET_ID,
                amountRaw: refQ.amountOut,
                slippageBps,
                recipient,
                refundTo: nearAccount,
                nearAccountId: nearAccount,
                depositType: 'ORIGIN_CHAIN',
                recipientType: 'DESTINATION_CHAIN',
                appFeeBps: 25,
                dry: true,
                signal
              }).catch((e) => ({ ok: false, error: e && e.message ? e.message : '' }));
              if (!bridgeQuote || !bridgeQuote.ok || !bridgeQuote.amountOut || BigInt(bridgeQuote.amountOut) <= 0n) {
                return {
                  ok: false,
                  quote: null,
                  depositAddress: null,
                  memo: null,
                  amountOut: null,
                  amountOutFormatted: null,
                  amountInUsd: null,
                  amountOutUsd: null,
                  serviceFeeBps: 0,
                  error: (bridgeQuote && bridgeQuote.error) || t('PRL 跨回主网桥接报价失败', 'PRL bridge-out quote unavailable')
                };
              }
              finalPrlOut = bridgeQuote.amountOut;
            }
            return {
              ok: true,
              compositeType: 'NEAR_TO_PRL_REF',
              refQuote: refQ,
              bridgeQuote,
              depositAddress: null,
              memo: null,
              amountOut: finalPrlOut,
              amountOutFormatted: fromBaseUnits(finalPrlOut, 8),
              amountInUsd: null,
              amountOutUsd: bridgeQuote?.amountOutUsd || null,
              serviceFeeBps: destIsPearlL1 ? 25 : 0,
              error: null
            };
          }
        }

        // External / 1Click Token -> NEAR USDC (1Click) -> PRL (Ref Finance Pool #9010) [-> Pearl L1 bridge]
        const oneClickStep1 = await quoteRawOneClick({
          originAsset,
          destinationAsset: NEAR_USDC_ASSET_ID,
          amountRaw: amtStr,
          slippageBps,
          recipient: nearAccount,
          refundTo: refundTo || nearAccount,
          nearAccountId: nearAccount,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          appFeeBps: 25,
          dry: true,
          signal
        });
        if (!oneClickStep1.ok || !oneClickStep1.amountOut) return oneClickStep1;

        const refFromUsdc = await quoteRefSmartRouterPath({
          tokenIn: NEAR_USDC_CONTRACT,
          tokenOut: PRL_NEAR_CONTRACT,
          amountRaw: oneClickStep1.amountOut,
          slippageBps,
          signal
        });
        if (!refFromUsdc.ok) {
          return { ok: false, quote: null, depositAddress: null, memo: null, amountOut: null, amountOutFormatted: null, amountInUsd: null, amountOutUsd: null, error: refFromUsdc.error };
        }
        let finalPrlOut = refFromUsdc.amountOut;
        let bridgeOutQuote = null;
        if (destIsPearlL1) {
          bridgeOutQuote = await quoteRawOneClick({
            originAsset: PRL_NEAR_ASSET_ID,
            destinationAsset: PRL_PEARL_ASSET_ID,
            amountRaw: refFromUsdc.amountOut,
            slippageBps,
            recipient,
            refundTo: nearAccount,
            nearAccountId: nearAccount,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            appFeeBps: 0,
            dry: true,
            signal
          }).catch((e) => ({ ok: false, error: e && e.message ? e.message : '' }));
          if (!bridgeOutQuote || !bridgeOutQuote.ok || !bridgeOutQuote.amountOut || BigInt(bridgeOutQuote.amountOut) <= 0n) {
            return {
              ok: false,
              quote: null,
              depositAddress: null,
              memo: null,
              amountOut: null,
              amountOutFormatted: null,
              amountInUsd: null,
              amountOutUsd: null,
              serviceFeeBps: 25,
              error: (bridgeOutQuote && bridgeOutQuote.error) || t('PRL 跨回主网桥接报价失败', 'PRL bridge-out quote unavailable')
            };
          }
          finalPrlOut = bridgeOutQuote.amountOut;
        }
        return {
          ok: true,
          compositeType: 'EXTERNAL_TO_PRL',
          oneClickQuote: oneClickStep1,
          refQuote: refFromUsdc,
          bridgeQuote: bridgeOutQuote,
          intermediaryUsdcAssetId: NEAR_USDC_ASSET_ID,
          intermediaryUsdcContract: NEAR_USDC_CONTRACT,
          depositAddress: null,
          memo: null,
          amountOut: finalPrlOut,
          amountOutFormatted: fromBaseUnits(finalPrlOut, 8),
          amountInUsd: oneClickStep1.amountInUsd || null,
          amountOutUsd: bridgeOutQuote?.amountOutUsd || null,
          serviceFeeBps: 25,
          error: null
        };
      }

      return { ok: false, quote: null, depositAddress: null, memo: null, amountOut: null, amountOutFormatted: null, amountInUsd: null, amountOutUsd: null, error: t('未识别 PRL 路由参数', 'Invalid PRL route') };
    } catch (err) {
      return {
        ok: false,
        quote: null,
        depositAddress: null,
        memo: null,
        amountOut: null,
        amountOutFormatted: null,
        amountInUsd: null,
        amountOutUsd: null,
        error: err && err.message ? err.message : t('PRL 组合路由询价失败', 'PRL composite quote failed')
      };
    }
  }

  /**
   * Requests a dry or live 1Click intent swap/withdraw quote supporting INTENTS & ORIGIN_CHAIN deposits,
   * automatically composing Ref Finance (#9010) + 1Click routes when PRL is paired with another token.
   */
  async function quoteIntentSwapOrWithdraw(params = {}) {
    const {
      originAsset,
      destinationAsset,
      amountRaw,
      slippageBps = 100,
      recipient,
      refundTo,
      depositType = 'ORIGIN_CHAIN',
      recipientType = 'DESTINATION_CHAIN',
      refundType,
      dry = true,
      appFeeBps = 25,
      referral = DEFAULT_REFERRAL_ACCOUNT,
      deadlineIso,
      signal = null
    } = params;

    if (!originAsset || !destinationAsset) {
      return {
        ok: false,
        quote: null,
        depositAddress: null,
        memo: null,
        amountOut: null,
        amountOutFormatted: null,
        amountInUsd: null,
        amountOutUsd: null,
        error: t('缺少源资产或目标资产标识', 'Missing originAsset or destinationAsset')
      };
    }

    const amountStr = String(amountRaw === undefined || amountRaw === null ? '' : amountRaw).trim();
    if (!/^\d+$/.test(amountStr) || BigInt(amountStr) <= 0n) {
      return {
        ok: false,
        quote: null,
        depositAddress: null,
        memo: null,
        amountOut: null,
        amountOutFormatted: null,
        amountInUsd: null,
        amountOutUsd: null,
        error: t('兑换数量必须大于 0', 'Quote amountRaw must be a positive integer string')
      };
    }

    if (!recipient) {
      return {
        ok: false,
        quote: null,
        depositAddress: null,
        memo: null,
        amountOut: null,
        amountOutFormatted: null,
        amountInUsd: null,
        amountOutUsd: null,
        error: t('缺少目标收款地址', 'Missing recipient address')
      };
    }

    const originIsPrl = isPrlAssetId(originAsset);
    const destIsPrl = isPrlAssetId(destinationAsset);
    if (dry !== false && (originIsPrl !== destIsPrl)) {
      return quoteCompositePrlSwap({
        originAsset,
        destinationAsset,
        amountRaw: amountStr,
        slippageBps,
        recipient,
        refundTo,
        nearAccountId: params.nearAccountId,
        signal
      });
    }

    try {
      return await quoteRawOneClick({
        ...params,
        amountRaw: amountStr
      });
    } catch (err) {
      return {
        ok: false,
        quote: null,
        depositAddress: null,
        memo: null,
        amountOut: null,
        amountOutFormatted: null,
        amountInUsd: null,
        amountOutUsd: null,
        error: err && err.message ? err.message : t('询价请求失败', 'Quote request failed')
      };
    }
  }

